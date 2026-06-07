import { hasher } from 'node-object-hash';

import { HashedSet } from '@remnawave/hashed-set';

import { UserForConfigEntity } from '@modules/users/entities/users-for-config';

type TCtrSingBoxConfig = object | Record<string, unknown> | string;

const SING_BOX_KEY_ALIASES: Record<string, string> = {
    autoDetectInterface: 'auto_detect_interface',
    certificatePath: 'certificate_path',
    domainSuffix: 'domain_suffix',
    ipIsPrivate: 'ip_is_private',
    keyPath: 'key_path',
    listenPort: 'listen_port',
};

interface SingBoxInbound {
    type?: string;
    tag?: string;
    listen_port?: number | string;
    users?: Array<Record<string, unknown>>;
    tls?: Record<string, unknown>;
    [key: string]: unknown;
}

interface SingBoxConfigObject {
    inbounds?: SingBoxInbound[];
    outbounds?: Array<Record<string, unknown>>;
    route?: {
        rules?: Array<Record<string, unknown>>;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

interface InboundsWithTagsAndType {
    tag: string;
    type: string;
    network: string | null;
    security: string | null;
    port: number | null;
    rawInbound: object | null;
}

const MANAGED_CLIENT_TYPES = new Set(['anytls']);
const ALLOWED_TYPES = new Set([
    'anytls',
    'direct',
    'http',
    'hysteria2',
    'mixed',
    'naive',
    'shadowsocks',
    'shadowtls',
    'socks',
    'trojan',
    'tuic',
    'vless',
    'vmess',
]);

export class SingBoxConfig {
    private config: SingBoxConfigObject;
    private inbounds: SingBoxInbound[] = [];
    private inboundsByTag: Record<string, SingBoxInbound> = {};

    constructor(configInput: TCtrSingBoxConfig) {
        this.config = this.parseConfig(configInput);
        this.validate();
        this.indexInbounds();
    }

    public getConfig(): SingBoxConfigObject {
        return this.config;
    }

    public getSortedConfig(): SingBoxConfigObject {
        return {
            ...this.config,
            inbounds: this.config.inbounds ? [...this.config.inbounds] : undefined,
            outbounds: this.config.outbounds ? [...this.config.outbounds] : undefined,
        };
    }

    public getConfigHash(): string {
        const hash = hasher({ trim: true, sort: false }).hash;
        return hash(this.getSortedConfig());
    }

    public getAllInbounds(): InboundsWithTagsAndType[] {
        return this.inbounds
            .filter((inbound) => this.hasManagedClients(inbound))
            .map((inbound) => ({
                tag: inbound.tag!,
                rawInbound: inbound as unknown as object,
                type: inbound.type!,
                network: null,
                security: inbound.tls ? 'tls' : null,
                port: this.parsePort(inbound.listen_port),
            }));
    }

    public cleanInboundClients(): void {
        if (!this.config.inbounds) return;

        for (const inbound of this.config.inbounds) {
            if (!this.hasManagedClients(inbound)) continue;
            inbound.users = [];
        }
    }

    public leaveInbounds(tags: Set<string>): void {
        this.config.inbounds = this.config.inbounds!.filter(
            (inbound) => tags.has(inbound.tag!) || !this.hasManagedClients(inbound),
        );
    }

    public includeUserBatch(
        users: UserForConfigEntity[],
        inboundsUserSets: Map<string, HashedSet>,
    ): SingBoxConfig {
        if (!this.config.inbounds) return this;

        const usersByTag = this.groupUsersByTag(users, inboundsUserSets);
        const inboundMap = new Map(
            this.config.inbounds
                .filter((inbound) => this.hasManagedClients(inbound))
                .map((inbound) => [inbound.tag, inbound]),
        );

        for (const [tag, tagUsers] of usersByTag) {
            const inbound = inboundMap.get(tag);
            if (!inbound) continue;

            inbound.users ??= [];
            for (const user of tagUsers) {
                inbound.users.push({
                    name: user.tId.toString(),
                    password: user.anytlsPassword,
                });
            }
        }

        return this;
    }

    public replaceSnippets(snippets: Map<string, unknown>): void {
        if (this.config.outbounds) {
            this.replaceSnippetsInArray(this.config.outbounds, snippets);
        }

        if (this.config.route?.rules) {
            this.replaceSnippetsInArray(this.config.route.rules, snippets);
        }
    }

    private replaceSnippetsInArray(
        array: Array<Record<string, unknown>> | undefined,
        snippetsMap: Map<string, unknown>,
    ): void {
        if (!array) return;

        for (let i = array.length - 1; i >= 0; i--) {
            const item = array[i];
            if (!item.snippet) continue;

            const snippet = snippetsMap.get(item.snippet as string);

            if (snippet) {
                if (Array.isArray(snippet)) {
                    array.splice(i, 1, ...(snippet as Record<string, unknown>[]));
                } else {
                    array[i] = snippet as Record<string, unknown>;
                }
            } else {
                array.splice(i, 1);
            }
        }
    }

    private groupUsersByTag(
        users: UserForConfigEntity[],
        inboundsUserSets: Map<string, HashedSet>,
    ): Map<string, UserForConfigEntity[]> {
        const usersByTag = new Map<string, UserForConfigEntity[]>();

        for (const user of users) {
            for (const tag of user.tags) {
                let tagUsers = usersByTag.get(tag);
                if (!tagUsers) {
                    tagUsers = [];
                    usersByTag.set(tag, tagUsers);
                }
                tagUsers.push(user);

                if (!inboundsUserSets.has(tag)) {
                    inboundsUserSets.set(tag, new HashedSet());
                }
                inboundsUserSets.get(tag)!.add(user.tId.toString());
            }
        }

        return usersByTag;
    }

    private hasManagedClients(inbound: SingBoxInbound): boolean {
        return typeof inbound.type === 'string' && MANAGED_CLIENT_TYPES.has(inbound.type);
    }

    private parseConfig(configInput: TCtrSingBoxConfig): SingBoxConfigObject {
        let parsedConfig: SingBoxConfigObject;

        if (typeof configInput === 'string') {
            try {
                parsedConfig = JSON.parse(configInput) as SingBoxConfigObject;
            } catch (error) {
                throw new Error(`Invalid JSON input: ${error}`);
            }
        } else if (typeof configInput === 'object') {
            parsedConfig = configInput as SingBoxConfigObject;
        } else {
            throw new Error('Invalid configuration format.');
        }

        return this.normalizeSingBoxKeys(parsedConfig) as SingBoxConfigObject;
    }

    private normalizeSingBoxKeys(value: unknown): unknown {
        if (Array.isArray(value)) {
            return value.map((item) => this.normalizeSingBoxKeys(item));
        }

        if (!value || typeof value !== 'object') {
            return value;
        }

        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, item]) => [
                SING_BOX_KEY_ALIASES[key] ?? key,
                this.normalizeSingBoxKeys(item),
            ]),
        );
    }

    private validate(): void {
        if (!this.config.inbounds || this.config.inbounds.length === 0) {
            throw new Error("Config doesn't have inbounds.");
        }

        const seenTags = new Set<string>();

        for (const inbound of this.config.inbounds) {
            this.validateType(inbound);
            this.validateTag(inbound, seenTags);
        }
    }

    private validateType(inbound: SingBoxInbound): void {
        if (inbound.type && !ALLOWED_TYPES.has(inbound.type)) {
            throw new Error(
                `Invalid sing-box inbound type "${inbound.type}" in inbound "${inbound.tag}".`,
            );
        }
    }

    private validateTag(inbound: SingBoxInbound, seenTags: Set<string>): void {
        if (!inbound.tag) {
            throw new Error('All inbounds must have a unique tag.');
        }
        if (inbound.tag.includes(',')) {
            throw new Error("Character ',' is not allowed in inbound tag.");
        }
        if (seenTags.has(inbound.tag)) {
            throw new Error(
                `Duplicate inbound tag "${inbound.tag}" found. All inbound tags must be unique.`,
            );
        }
        seenTags.add(inbound.tag);
    }

    private indexInbounds(): void {
        for (const inbound of this.config.inbounds!) {
            this.inbounds.push(inbound);
            this.inboundsByTag[inbound.tag!] = inbound;
        }
    }

    private parsePort(port: number | string | undefined): number | null {
        if (!port) return null;

        if (typeof port === 'string') {
            const first = port.includes(',') ? port.split(',')[0] : port;
            return Number(first);
        }

        return port;
    }
}
