import { filter, shuffle } from 'lodash';
import { customAlphabet } from 'nanoid';

import { Injectable } from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config';
import { getSnellPsk } from '@common/helpers/snell';
import { TemplateEngine } from '@common/utils/templates/replace-templates-values';
import { SUBSCRIPTION_TEMPLATE_TYPE, USERS_STATUS } from '@libs/contracts/constants';
import { HostMapperSchema } from '@libs/contracts/models';

import { ExternalSquadEntity } from '@modules/external-squads/entities';
import { HostWithRawInbound } from '@modules/hosts/entities/host-with-inbound-tag.entity';
import { ISRRContext } from '@modules/subscription-response-rules/interfaces';
import { SubscriptionSettingsEntity } from '@modules/subscription-settings/entities/subscription-settings.entity';
import { UserEntity } from '@modules/users/entities';

import {
    ProtocolVariant,
    ResolvedProxyConfig,
    SecurityVariant,
    TransportVariant,
} from './interfaces';
import { override, parseResolvedProxyRemark, toNonEmptyRecord } from './utils';

export interface IResolveProxyConfigOptions {
    subscriptionSettings: SubscriptionSettingsEntity | null;
    hosts: HostWithRawInbound[];
    user: UserEntity;
    hostsOverrides?: ExternalSquadEntity['hostOverrides'];
    fallbackOptions?: {
        showHwidMaxDeviceRemarks?: boolean;
        showHwidNotSupportedRemarks?: boolean;
        respondWithRemarks?: string[];
    };
    excludeHostsByTags?: ISRRContext['excludeHostsByTags'];
}

interface SingBoxInbound {
    type?: string;
    tag?: string;
    listen_port?: number | string;
    method?: string;
    network?: string;
    transport?: {
        headers?: Record<string, string>;
        host?: string;
        path?: string;
        service_name?: string;
        type?: string;
    };
    tls?: {
        alpn?: string[];
        server_name?: string;
        [key: string]: unknown;
    };
    users?: Array<Record<string, unknown>>;
    version?: number;
    congestion_control?: string;
    heartbeat?: string;
    udp_relay_mode?: string;
    zero_rtt_handshake?: boolean;
    [key: string]: unknown;
}

@Injectable()
export class ResolveProxyConfigService {
    private readonly nanoid: ReturnType<typeof customAlphabet>;
    private readonly subPublicDomain: string;
    private readonly domainRegex =
        /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

    constructor(private readonly configService: TypedConfigService) {
        this.nanoid = customAlphabet('0123456789abcdefghjkmnopqrstuvwxyz', 10);
        this.subPublicDomain = this.configService.getOrThrow('SUB_PUBLIC_DOMAIN');
    }

    public async resolveProxyConfig(
        options: IResolveProxyConfigOptions,
    ): Promise<ResolvedProxyConfig[]> {
        const { user, hostsOverrides, subscriptionSettings, fallbackOptions, excludeHostsByTags } =
            options;

        if (subscriptionSettings === null) {
            return [];
        }

        if (excludeHostsByTags) {
            options.hosts = options.hosts.filter(
                (h) => !h.tags.some((tag) => excludeHostsByTags.has(tag)),
            );
        }

        const earlyRemarks = this.resolveEarlyExitRemarks(
            user,
            subscriptionSettings,
            fallbackOptions,
            options.hosts.length,
        );
        if (earlyRemarks !== null) {
            return this.createFallbackHosts(
                this.templateRemarks(earlyRemarks, user, subscriptionSettings),
            );
        }

        const hosts = this.applyShuffle(options.hosts);

        const knownRemarks = new Map<string, number>();
        const resolvedProxyConfigs: ResolvedProxyConfig[] = [];

        const userValueMap = TemplateEngine.createUserValueMap(
            user,
            subscriptionSettings,
            this.subPublicDomain,
        );

        for (const inputHost of hosts) {
            this.applyHostOverrides(inputHost, hostsOverrides);

            const finalRemark = this.deduplicateRemark(
                TemplateEngine.replace(inputHost.remark, userValueMap),
                knownRemarks,
            );

            if (!this.isSingBoxManagedInbound(inputHost.rawInbound)) continue;

            const resolvedProxyConfig = this.buildSingBoxResolvedProxyConfig({
                inputHost,
                inbound: inputHost.rawInbound,
                finalRemark,
                user,
            });

            if (resolvedProxyConfig) {
                resolvedProxyConfigs.push(resolvedProxyConfig);
            }
        }

        return resolvedProxyConfigs;
    }

    private resolveEarlyExitRemarks(
        user: UserEntity,
        settings: SubscriptionSettingsEntity,
        fallbackOptions: IResolveProxyConfigOptions['fallbackOptions'],
        hostCount: number,
    ): string[] | null {
        if (settings.isShowCustomRemarks) {
            if (fallbackOptions) {
                if (fallbackOptions.showHwidMaxDeviceRemarks) {
                    return settings.customRemarks.HWIDMaxDevicesExceeded;
                }
                if (fallbackOptions.showHwidNotSupportedRemarks) {
                    return settings.customRemarks.HWIDNotSupported;
                }
                if (fallbackOptions.respondWithRemarks?.length) {
                    return fallbackOptions.respondWithRemarks;
                }
            }

            if (user.status !== USERS_STATUS.ACTIVE) {
                const statusRemarksMap: Partial<Record<string, string[]>> = {
                    [USERS_STATUS.EXPIRED]: settings.customRemarks.expiredUsers,
                    [USERS_STATUS.DISABLED]: settings.customRemarks.disabledUsers,
                    [USERS_STATUS.LIMITED]: settings.customRemarks.limitedUsers,
                };
                return statusRemarksMap[user.status] ?? [];
            }
        }

        if (hostCount === 0) {
            return settings.customRemarks.emptyHosts;
        }

        return null;
    }

    private resolveFinalServerName(
        inputHost: HostWithRawInbound,
        serverName: string | undefined,
        resolvedAddress: string,
    ): string {
        if (inputHost.keepSniBlank) {
            return '';
        }

        if (inputHost.overrideSniFromAddress) {
            return resolvedAddress;
        }

        let baseSni = serverName ?? '';

        if (inputHost.sni) {
            baseSni = inputHost.sni;
        }

        if (!baseSni && this.isDomain(inputHost.address)) {
            baseSni = inputHost.address;
        }

        return this.resolveRandomizedValue(baseSni);
    }

    private buildSingBoxResolvedProxyConfig(ctx: {
        inputHost: HostWithRawInbound;
        inbound: SingBoxInbound;
        finalRemark: string;
        user: UserEntity;
    }): ResolvedProxyConfig | null {
        const { inputHost, inbound, finalRemark, user } = ctx;
        const address = this.resolveRandomizedValue(inputHost.address);
        const serverName = this.resolveFinalServerName(
            inputHost,
            inbound.tls?.server_name,
            address,
        );
        const protocol = this.resolveSingBoxProtocolOptions(inbound, user);

        if (!protocol) {
            return null;
        }
        const security: SecurityVariant = inbound.tls
            ? {
                  security: 'tls',
                  securityOptions: {
                      alpn: override(inputHost.alpn, inbound.tls.alpn?.join(',')) ?? '',
                      enableSessionResumption: false,
                      fingerprint: inputHost.fingerprint || 'chrome',
                      serverName,
                      pinnedPeerCertSha256: null,
                      verifyPeerCertByName: null,
                      echConfigList: null,
                      echForceQuery: null,
                      echSockopt: null,
                      cipherSuites: null,
                  },
              }
            : {
                  security: 'none',
              };

        return {
            finalRemark,
            address,
            port: inputHost.port,
            streamOverrides: {
                finalMask: toNonEmptyRecord(inputHost.finalMask),
                sockopt: toNonEmptyRecord(inputHost.sockoptParams),
            },
            mux: toNonEmptyRecord(inputHost.muxParams),
            clientOverrides: {
                shuffleHost: inputHost.shuffleHost,
                mihomoX25519: inputHost.mihomoX25519,
                mihomoIpVersion: inputHost.mihomoIpVersion,
                serverDescription: inputHost.serverDescription
                    ? Buffer.from(inputHost.serverDescription).toString('base64')
                    : null,
                mapper: HostMapperSchema.parse(inputHost.mapper ?? {}),
            },
            metadata: {
                uuid: inputHost.uuid,
                tags: inputHost.tags,
                excludeFromSubscriptionTypes: inputHost.excludeFromSubscriptionTypes.filter(
                    (type) => Object.values(SUBSCRIPTION_TEMPLATE_TYPE).includes(type),
                ),
                inboundTag: inputHost.inboundTag,
                configProfileUuid: inputHost.configProfileUuid,
                configProfileInboundUuid: inputHost.configProfileInboundUuid,
                isDisabled: inputHost.isDisabled,
                isHidden: inputHost.isHidden,
                viewPosition: inputHost.viewPosition,
                remark: inputHost.remark,
                vlessRouteId: inputHost.vlessRouteId,
                rawInbound: inputHost.rawInbound,
            },
            ...protocol,
            ...security,
            ...this.resolveSingBoxTransport(inbound, inputHost),
        } satisfies ResolvedProxyConfig;
    }

    private resolveSingBoxProtocolOptions(
        inbound: SingBoxInbound,
        user: UserEntity,
    ): ProtocolVariant | null {
        switch (inbound.type) {
            case 'snell':
                if (inbound.version !== 5 || inbound.multi_user_psk !== true) return null;
                return {
                    protocol: 'snell',
                    protocolOptions: {
                        psk: getSnellPsk(user),
                        version: 5,
                        obfs: inbound.obfs_mode === 'http' ? 'http' : 'none',
                    },
                };
            case 'anytls':
                return {
                    protocol: 'anytls',
                    protocolOptions: {
                        password: user.anytlsPassword,
                    },
                };
            case 'vless':
                return {
                    protocol: 'vless',
                    protocolOptions: {
                        id: user.vlessUuid,
                        encryption: 'none',
                        flow: '',
                    },
                };
            case 'vmess':
                return {
                    protocol: 'vmess',
                    protocolOptions: {
                        uuid: user.vlessUuid,
                        alterId: 0,
                        security: 'auto',
                    },
                };
            case 'trojan':
                return {
                    protocol: 'trojan',
                    protocolOptions: {
                        password: user.trojanPassword,
                    },
                };
            case 'shadowsocks':
                return {
                    protocol: 'shadowsocks',
                    protocolOptions: {
                        method: inbound.method || 'chacha20-ietf-poly1305',
                        password: user.ssPassword,
                        uot: false,
                        uotVersion: 1,
                    },
                };
            case 'hysteria2':
                return {
                    protocol: 'hysteria2',
                    protocolOptions: {
                        password: user.vlessUuid,
                    },
                };
            case 'tuic':
                return {
                    protocol: 'tuic',
                    protocolOptions: {
                        uuid: user.vlessUuid,
                        password: user.trojanPassword,
                        congestionControl: inbound.congestion_control ?? null,
                        heartbeat: inbound.heartbeat ?? null,
                        udpRelayMode: inbound.udp_relay_mode ?? null,
                        zeroRtt: inbound.zero_rtt_handshake ?? false,
                    },
                };
            case 'shadowtls':
                return {
                    protocol: 'shadowtls',
                    protocolOptions: {
                        password: user.trojanPassword,
                        version: inbound.version ?? 3,
                    },
                };
            default:
                return null;
        }
    }

    private resolveSingBoxTransport(
        inbound: SingBoxInbound,
        inputHost: HostWithRawInbound,
    ): TransportVariant {
        const transport = inbound.transport;

        switch (transport?.type) {
            case 'ws':
                return {
                    transport: 'ws',
                    transportOptions: {
                        host: this.resolveRandomizedValue(
                            override(inputHost.host, transport.host) ?? '',
                        ),
                        path: override(inputHost.path, transport.path),
                        headers: transport.headers ?? null,
                        heartbeatPeriod: null,
                    },
                };
            case 'httpupgrade':
                return {
                    transport: 'httpupgrade',
                    transportOptions: {
                        host: this.resolveRandomizedValue(
                            override(inputHost.host, transport.host) ?? '',
                        ),
                        path: override(inputHost.path, transport.path),
                        headers: transport.headers ?? null,
                    },
                };
            case 'grpc':
                return {
                    transport: 'grpc',
                    transportOptions: {
                        authority: this.resolveRandomizedValue(inputHost.host ?? ''),
                        serviceName: override(inputHost.path, transport.service_name),
                        multiMode: false,
                    },
                };
            default:
                return {
                    transport: 'tcp',
                    transportOptions: {
                        header: null,
                    },
                };
        }
    }

    private isSingBoxManagedInbound(rawInbound: object | null): rawInbound is SingBoxInbound {
        return (
            typeof rawInbound === 'object' &&
            rawInbound !== null &&
            'type' in rawInbound &&
            typeof rawInbound.type === 'string' &&
            [
                'snell',
                'anytls',
                'hysteria2',
                'shadowsocks',
                'shadowtls',
                'trojan',
                'tuic',
                'vless',
                'vmess',
            ].includes(rawInbound.type)
        );
    }

    private resolveRandomizedValue(value: string): string {
        if (!value) return value;

        if (value.includes(',')) {
            const parts = value.split(',');
            return parts[Math.floor(Math.random() * parts.length)].trim();
        }

        if (value.includes('*')) {
            return value.replace('*', this.nanoid()).trim();
        }

        return value;
    }

    private isDomain(str: string): boolean {
        return this.domainRegex.test(str);
    }

    private deduplicateRemark(remark: string, knownRemarks: Map<string, number>): string {
        const currentCount = knownRemarks.get(remark) || 0;
        knownRemarks.set(remark, currentCount + 1);

        if (currentCount === 0) {
            return remark;
        }

        const hasExistingSuffix = remark.includes('^~') && remark.endsWith('~^');
        const suffix = hasExistingSuffix ? currentCount : currentCount + 1;
        return `${remark} ^~${suffix}~^`;
    }

    private applyHostOverrides(
        host: HostWithRawInbound,
        overrides?: ExternalSquadEntity['hostOverrides'],
    ): void {
        if (!overrides) return;

        if (overrides.vlessRouteId !== undefined) {
            host.vlessRouteId = overrides.vlessRouteId;
        }
        if (overrides.serverDescription !== undefined) {
            host.serverDescription = overrides.serverDescription;
        }
    }

    private applyShuffle(hosts: HostWithRawInbound[]): HostWithRawInbound[] {
        if (!hosts.some((h) => h.shuffleHost)) {
            return hosts;
        }
        return [...shuffle(filter(hosts, 'shuffleHost')), ...filter(hosts, (h) => !h.shuffleHost)];
    }

    private templateRemarks(
        remarks: string[],
        user: UserEntity,
        settings: SubscriptionSettingsEntity,
    ): string[] {
        const userValueMap = TemplateEngine.createUserValueMap(
            user,
            settings,
            this.subPublicDomain,
        );
        return remarks.map((remark) => TemplateEngine.replace(remark, userValueMap));
    }

    private parseResolvedProxyConfigFromRemark(remark: string): ResolvedProxyConfig | null {
        const parsed = parseResolvedProxyRemark(remark);

        return parsed.kind === 'resolved' ? parsed.config : null;
    }

    private createFallbackHosts(remarks: string[]): ResolvedProxyConfig[] {
        return remarks.map(
            (remark) =>
                this.parseResolvedProxyConfigFromRemark(remark.trim()) ??
                ({
                    finalRemark: remark,
                    address: '0.0.0.0',
                    port: 1,
                    streamOverrides: {
                        finalMask: null,
                        sockopt: null,
                    },
                    mux: null,
                    protocol: 'vless',
                    protocolOptions: {
                        id: '00000000-0000-0000-0000-000000000000',
                        encryption: 'none',
                        flow: '',
                    },
                    transport: 'tcp',
                    transportOptions: {
                        header: null,
                    },
                    security: 'none',
                    clientOverrides: {
                        shuffleHost: false,
                        mihomoX25519: false,
                        serverDescription: null,
                        mihomoIpVersion: null,
                        mapper: {},
                    },
                    metadata: {
                        uuid: '00000000-0000-0000-0000-000000000000',
                        tags: [],
                        excludeFromSubscriptionTypes: [],
                        inboundTag: '',
                        configProfileUuid: null,
                        configProfileInboundUuid: null,
                        isDisabled: false,
                        isHidden: false,
                        viewPosition: 0,
                        remark: remark,
                        vlessRouteId: null,
                        rawInbound: null,
                    },
                } satisfies ResolvedProxyConfig),
        );
    }
}
