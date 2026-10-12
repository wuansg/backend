import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

import { stableJsonHash } from '@common/utils/stable-json-hash.util';

type Config = Record<string, unknown>;
export function stripDynamicUsers(config: Config): Config {
    const result = structuredClone(config);
    if (Array.isArray(result.inbounds))
        result.inbounds = result.inbounds.map((value) => {
            const inbound = { ...(value as Config) };
            // All managed sing-box protocols use the users array. Anonymous inbounds stay unchanged.
            if ('users' in inbound) inbound.users = [];
            return inbound;
        });
    return result;
}
export function restoreTemplateWithCurrentUsers(template: Config, current: Config): Config {
    const result = stripDynamicUsers(template);
    const authorized = new Map(
        (Array.isArray(current.inbounds) ? current.inbounds : []).map((value) => {
            const inbound = value as Config;
            return [inbound.tag, inbound] as const;
        }),
    );
    if (Array.isArray(result.inbounds))
        result.inbounds = result.inbounds.map((value) => {
            const inbound = value as Config;
            const fresh = authorized.get(inbound.tag);
            if ('users' in inbound) {
                if (!fresh || fresh.type !== inbound.type) throw Error('ROLLBACK_INBOUND_MISMATCH');
                inbound.users = structuredClone(Array.isArray(fresh.users) ? fresh.users : []);
            }
            return inbound;
        });
    return result;
}
export function changedSections(previous: Config | undefined, current: Config): string[] {
    // Only fixed root section names, never values or arbitrary user-supplied map keys.
    const sections = [
        'log',
        'dns',
        'ntp',
        'certificate',
        'certificate_providers',
        'http_clients',
        'network_namespaces',
        'endpoints',
        'inbounds',
        'outbounds',
        'route',
        'services',
        'experimental',
    ];
    return sections.filter(
        (key) => stableJsonHash(previous?.[key] ?? null) !== stableJsonHash(current[key] ?? null),
    );
}
function key(secret: string) {
    if (!secret) throw Error('Snapshot encryption key unavailable');
    return Buffer.from(
        hkdfSync('sha256', secret, 'remnawave-config-snapshots-v1', 'node-revision-encryption', 32),
    );
}
export function encryptSnapshot(config: unknown, secret: string, binding: string): string {
    const bytes = Buffer.from(JSON.stringify(config));
    if (bytes.length > 8 * 1024 * 1024) throw Error('CONFIG_SNAPSHOT_TOO_LARGE');
    const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key(secret), iv);
    cipher.setAAD(Buffer.from(binding));
    return [
        'v1',
        iv.toString('base64'),
        Buffer.concat([cipher.update(bytes), cipher.final()]).toString('base64'),
        cipher.getAuthTag().toString('base64'),
    ].join('.');
}
export function decryptSnapshot(snapshot: string, secret: string, binding: string): Config {
    const [version, iv, bytes, tag, extra] = snapshot.split('.');
    if (version !== 'v1' || !iv || !bytes || !tag || extra || bytes.length > 12 * 1024 * 1024)
        throw Error('INVALID_SNAPSHOT');
    const decipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(iv, 'base64'));
    decipher.setAAD(Buffer.from(binding));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(
        Buffer.concat([decipher.update(Buffer.from(bytes, 'base64')), decipher.final()]).toString(
            'utf8',
        ),
    ) as Config;
}
