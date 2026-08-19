import { Injectable, Logger } from '@nestjs/common';

import { isNonEmptyObject, parseIntRangeUtil } from '@common/utils';
import { FINGERPRINTS } from '@libs/contracts/constants';

import { SubscriptionTemplateService } from '@modules/subscription-template/subscription-template.service';

import { applyHostMapper } from '../host-mapper';
import { ResolvedProxyConfig } from '../resolve-proxy/interfaces';

/** Target: sing-box 1.13.x. */

interface OutboundConfig {
    alter_id?: number;
    brutal_debug?: boolean;
    congestion_control?: string;
    down_mbps?: number;
    flow?: string;
    global_padding?: boolean;
    heartbeat?: string;
    hop_interval?: string;
    method?: string;
    multiplex?: MultiplexConfig;
    network?: string;
    obfs?: ObfsConfig;
    outbounds?: string[];
    password?: string;
    remnawave?: { includeProxies?: boolean };
    server: string;
    server_port: number;
    server_ports?: string[];
    tag: string;
    tls?: TlsConfig;
    transport?: TransportConfig;
    type: string;
    up_mbps?: number;
    udp_relay_mode?: string;
    uuid?: string;
    udp_over_tcp?: {
        enabled: boolean;
        version?: number;
    };
    version?: number;
    zero_rtt_handshake?: boolean;
}

interface ObfsConfig {
    password: string;
    type: 'salamander';
}

interface MultiplexConfig {
    brutal?: {
        down_mbps: number;
        enabled: boolean;
        up_mbps: number;
    };
    enabled: boolean;
    max_connections?: number;
    max_streams?: number;
    min_streams?: number;
    padding?: boolean;
    protocol?: string;
}

interface TlsConfig {
    alpn?: string[];
    enabled?: boolean;
    insecure?: boolean;
    reality?: {
        enabled: boolean;
        public_key?: string;
        short_id?: string;
    };
    server_name?: string;
    utls?: {
        enabled: boolean;
        fingerprint: string;
    };
}

interface TransportConfig {
    early_data_header_name?: string;
    headers?: Record<string, string>;
    host?: string;
    max_early_data?: number;
    path?: string;
    service_name?: string;
    type: string;
}

interface Hysteria2FinalMask {
    quicParams?: {
        brutalDown?: number | string;
        brutalUp?: number | string;
        udpHop?: {
            interval?: number | string;
            ports?: number | string;
        };
    };
    udp?: Array<{
        settings?: { password?: string };
        type?: string;
    }>;
}

const UNSUPPORTED_TRANSPORTS = new Set(['kcp', 'xhttp']);
const PROXY_PROTOCOL_TYPES = new Set([
    'anytls',
    'hysteria',
    'hysteria2',
    'shadowsocks',
    'shadowtls',
    'trojan',
    'tuic',
    'vless',
    'vmess',
]);
const SELECTOR_TYPES = new Set([
    'anytls',
    'hysteria2',
    'shadowsocks',
    'shadowtls',
    'trojan',
    'tuic',
    'urltest',
    'vless',
    'vmess',
]);
const MULTIPLEX_PROTOCOLS = new Set(['h2mux', 'smux', 'yamux']);
const DURATION_REGEX = /^\d+(\.\d+)?(ns|us|µs|ms|s|m|h)$/;

@Injectable()
export class SingBoxGeneratorService {
    private readonly logger = new Logger(SingBoxGeneratorService.name);

    constructor(private readonly subscriptionTemplateService: SubscriptionTemplateService) {}

    public async generateConfig(
        hosts: ResolvedProxyConfig[],
        overrideTemplateName?: string,
    ): Promise<string> {
        try {
            const template = (await this.subscriptionTemplateService.getCachedTemplateByType(
                'SINGBOX',
                overrideTemplateName,
            )) as Record<string, unknown>;

            const userOutbounds: OutboundConfig[] = [];

            for (const host of hosts) {
                if (host.metadata.excludeFromSubscriptionTypes.includes('SINGBOX')) continue;
                if (UNSUPPORTED_TRANSPORTS.has(host.transport)) continue;

                const outbound = this.buildOutbound(host);
                if (!outbound) continue;

                userOutbounds.push(outbound);
            }

            return this.renderConfig(template, userOutbounds);
        } catch (error) {
            this.logger.error(`Error generating sing-box config: ${error}`);
            return '';
        }
    }

    private buildOutbound(host: ResolvedProxyConfig): OutboundConfig | null {
        try {
            const config = this.buildBaseOutbound(host);
            if (!config) return null;

            return applyHostMapper(config, host.clientOverrides.mapper.singbox, host);
        } catch (error) {
            this.logger.warn(`Skipping invalid sing-box outbound ${host.finalRemark}: ${error}`);
            return null;
        }
    }

    private buildBaseOutbound(host: ResolvedProxyConfig): OutboundConfig | null {
        if (host.protocol === 'hysteria') {
            return this.buildHysteria2Outbound(host);
        }

        const config: OutboundConfig = {
            type: host.protocol,
            tag: host.finalRemark,
            server: host.address,
            server_port: host.port,
        };

        if (!this.applyProtocolFields(config, host)) {
            return null;
        }

        this.applyTransport(config, host);
        this.applySecurity(config, host);
        this.applyMultiplex(config, host);

        return config;
    }

    private applyProtocolFields(config: OutboundConfig, host: ResolvedProxyConfig): boolean {
        switch (host.protocol) {
            case 'vless':
                if (host.protocolOptions.encryption && host.protocolOptions.encryption !== 'none') {
                    return false;
                }

                config.uuid = host.protocolOptions.id;

                if (
                    host.protocolOptions.flow === 'xtls-rprx-vision' &&
                    host.transport === 'tcp' &&
                    host.security !== 'none'
                ) {
                    config.flow = host.protocolOptions.flow;
                }
                return true;

            case 'trojan':
                config.password = host.protocolOptions.password;
                return true;

            case 'shadowsocks':
                config.password = host.protocolOptions.password;
                config.method = host.protocolOptions.method;

                if (host.protocolOptions.uot) {
                    config.network = 'tcp';
                    config.udp_over_tcp = {
                        enabled: true,
                        ...(host.protocolOptions.uotVersion === 1 && { version: 1 }),
                    };
                }
                return true;

            case 'anytls':
                config.password = host.protocolOptions.password;
                return true;

            case 'vmess':
                config.uuid = host.protocolOptions.uuid;
                config.alter_id = host.protocolOptions.alterId;
                config.method = host.protocolOptions.security;
                return true;

            case 'hysteria':
                config.type = 'hysteria2';
                config.password = host.protocolOptions.password;
                return true;

            case 'hysteria2':
                config.password = host.protocolOptions.password;
                return true;

            case 'tuic':
                config.uuid = host.protocolOptions.uuid;
                config.password = host.protocolOptions.password;

                if (host.protocolOptions.congestionControl) {
                    config.congestion_control = host.protocolOptions.congestionControl;
                }
                if (host.protocolOptions.udpRelayMode) {
                    config.udp_relay_mode = host.protocolOptions.udpRelayMode;
                }
                if (host.protocolOptions.heartbeat) {
                    config.heartbeat = host.protocolOptions.heartbeat;
                }
                if (host.protocolOptions.zeroRtt) {
                    config.zero_rtt_handshake = true;
                }
                return true;

            case 'shadowtls':
                config.password = host.protocolOptions.password;
                config.version = host.protocolOptions.version;
                return true;

            default:
                return false;
        }
    }

    private applyMultiplex(config: OutboundConfig, host: ResolvedProxyConfig): void {
        if (config.udp_over_tcp?.enabled) return;

        const multiplex = this.buildMultiplexConfig(host.mux);
        if (multiplex) config.multiplex = multiplex;
    }

    private buildMultiplexConfig(mux: Record<string, unknown> | null): MultiplexConfig | null {
        const smux = mux?.smux;
        if (!isNonEmptyObject(smux) || smux.enabled !== true) return null;

        const config: MultiplexConfig = { enabled: true };

        if (typeof smux.protocol === 'string' && MULTIPLEX_PROTOCOLS.has(smux.protocol)) {
            config.protocol = smux.protocol;
        }

        const maxConnections = this.parsePositiveInt(smux['max-connections']);
        const minStreams = this.parsePositiveInt(smux['min-streams']);
        const maxStreams = this.parsePositiveInt(smux['max-streams']);

        if (maxConnections) config.max_connections = maxConnections;
        if (minStreams) config.min_streams = minStreams;
        if (maxStreams) config.max_streams = maxStreams;
        if (smux.padding === true) config.padding = true;

        const brutal = smux['brutal-opts'];
        if (isNonEmptyObject(brutal) && brutal.enabled === true) {
            const upMbps = this.parsePositiveInt(brutal.up);
            const downMbps = this.parsePositiveInt(brutal.down);

            if (upMbps && downMbps) {
                config.brutal = { enabled: true, up_mbps: upMbps, down_mbps: downMbps };
            }
        }

        return config;
    }

    private parsePositiveInt(value: unknown): number | null {
        if (typeof value !== 'number' && typeof value !== 'string') return null;

        const parsed = Number.parseInt(String(value).trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    private buildHysteria2Outbound(
        host: Extract<ResolvedProxyConfig, { protocol: 'hysteria' }>,
    ): OutboundConfig | null {
        if (host.transport !== 'hysteria') return null;

        const config: OutboundConfig = {
            type: 'hysteria2',
            tag: host.finalRemark,
            server: host.address,
            server_port: host.port,
            password: host.transportOptions.auth,
            tls: this.buildQuicTlsConfig(host),
        };

        const finalMask = host.streamOverrides.finalMask as Hysteria2FinalMask | null;
        const { brutalDown, brutalUp, udpHop } = finalMask?.quicParams ?? {};
        const upMbps = this.parsePositiveInt(brutalUp);
        const downMbps = this.parsePositiveInt(brutalDown);

        if (upMbps) config.up_mbps = upMbps;
        if (downMbps) config.down_mbps = downMbps;

        const serverPorts = this.parsePortRanges(udpHop?.ports);
        if (serverPorts.length) {
            config.server_ports = serverPorts;

            const hopInterval = this.parseDuration(udpHop?.interval);
            if (hopInterval) config.hop_interval = hopInterval;
        }

        const obfs = this.buildObfsConfig(finalMask);
        if (obfs) config.obfs = obfs;

        return config;
    }

    private buildObfsConfig(finalMask: Hysteria2FinalMask | null): ObfsConfig | null {
        if (!Array.isArray(finalMask?.udp)) return null;

        const mask = finalMask.udp.find(
            (item) => item?.type === 'salamander' && item.settings?.password,
        );

        return mask?.settings?.password
            ? { type: 'salamander', password: mask.settings.password }
            : null;
    }

    private parsePortRanges(value: number | string | undefined): string[] {
        if (value === undefined || value === null || value === '') return [];

        const ranges: string[] = [];
        for (const part of String(value).split(',')) {
            const { from, to } = parseIntRangeUtil(part.trim());
            if (from === null || from === 0 || from > 65535) continue;

            const end = to === null || to > 65535 ? from : to;
            ranges.push(`${from}:${end}`);
        }

        return ranges;
    }

    private parseDuration(value: number | string | undefined): string | null {
        if (value === undefined || value === null || value === '') return null;

        const raw = String(value).trim();
        if (/^\d+$/.test(raw)) return Number(raw) > 0 ? `${raw}s` : null;

        return DURATION_REGEX.test(raw) ? raw : null;
    }

    private applyTransport(config: OutboundConfig, host: ResolvedProxyConfig): void {
        switch (host.transport) {
            case 'ws':
                config.transport = this.buildWsTransport(
                    host.transportOptions.path,
                    host.transportOptions.host,
                    host.transportOptions.headers,
                );
                break;

            case 'httpupgrade':
                config.transport = this.buildHttpUpgradeTransport(
                    host.transportOptions.path,
                    host.transportOptions.host,
                    host.transportOptions.headers,
                );
                break;

            case 'grpc':
                config.transport = this.buildGrpcTransport(host.transportOptions.serviceName);
                break;

            default:
                break;
        }
    }

    private buildWsTransport(
        rawPath: string | null,
        host: string | null,
        rawHeaders: Record<string, string> | null,
    ): TransportConfig {
        const config: TransportConfig = {
            type: 'ws',
        };

        let path = rawPath ?? '';

        if (path.includes('?ed=')) {
            const [pathPart, edPart] = path.split('?ed=');
            path = pathPart;
            const parsed = Number(edPart.split('/')[0]);
            if (!isNaN(parsed)) {
                config.max_early_data = parsed;
            }
            config.early_data_header_name = 'Sec-WebSocket-Protocol';
        }

        if (path) {
            config.path = path;
        }

        const headers = this.buildHeaders(rawHeaders, host);
        if (headers) config.headers = headers;

        return config;
    }

    private buildHttpUpgradeTransport(
        rawPath: string | null,
        host: string | null,
        rawHeaders: Record<string, string> | null,
    ): TransportConfig {
        const config: TransportConfig = {
            type: 'httpupgrade',
        };

        const path = rawPath ?? '';

        if (path) {
            config.path = path;
        }

        if (host) {
            config.host = host;
        }

        const headers = this.buildHeaders(rawHeaders, null);
        if (headers) config.headers = headers;

        return config;
    }

    private buildGrpcTransport(serviceName: string | null): TransportConfig {
        return {
            type: 'grpc',
            service_name: serviceName ?? '',
        };
    }

    private buildHeaders(
        rawHeaders: Record<string, string> | null,
        host: string | null,
    ): Record<string, string> | null {
        const headers: Record<string, string> = {};

        if (rawHeaders) {
            for (const [key, value] of Object.entries(rawHeaders)) {
                if (key.toLowerCase() === 'host' && !host) continue;
                if (typeof value !== 'string') continue;

                headers[key] = value;
            }
        }

        if (host) headers.Host = host;

        return Object.keys(headers).length ? headers : null;
    }

    private applySecurity(config: OutboundConfig, host: ResolvedProxyConfig): void {
        switch (host.security) {
            case 'tls':
                config.tls = this.buildTlsConfig(host);
                break;
            case 'reality':
                config.tls = this.buildRealityConfig(host);
                break;
            case 'none':
                break;
        }
    }

    private buildTlsConfig(host: Extract<ResolvedProxyConfig, { security: 'tls' }>): TlsConfig {
        const opts = host.securityOptions;
        const config: TlsConfig = {
            enabled: true,
        };

        if (opts.serverName) {
            config.server_name = opts.serverName;
        }

        if (opts.fingerprint) {
            config.utls = {
                enabled: true,
                fingerprint: this.resolveFingerprint(opts.fingerprint),
            };
        }

        // allowInsecure
        if (opts.pinnedPeerCertSha256) {
            config.insecure = true;
        }

        if (opts.alpn) {
            config.alpn = opts.alpn.split(',').map((a) => a.trim());
        }

        return config;
    }

    private buildRealityConfig(
        host: Extract<ResolvedProxyConfig, { security: 'reality' }>,
    ): TlsConfig {
        const opts = host.securityOptions;
        const config: TlsConfig = {
            enabled: true,
            reality: { enabled: true },
        };

        if (opts.serverName) {
            config.server_name = opts.serverName;
        }

        if (opts.publicKey) {
            config.reality!.public_key = opts.publicKey;
        }

        if (opts.shortId) {
            config.reality!.short_id = opts.shortId;
        }

        config.utls = {
            enabled: true,
            fingerprint: this.resolveFingerprint(opts.fingerprint),
        };

        return config;
    }

    private buildQuicTlsConfig(host: ResolvedProxyConfig): TlsConfig {
        const config: TlsConfig = { enabled: true };
        if (host.security !== 'tls') return config;

        const opts = host.securityOptions;
        if (opts.serverName) config.server_name = opts.serverName;
        if (opts.pinnedPeerCertSha256) config.insecure = true;
        if (opts.alpn) config.alpn = opts.alpn.split(',').map((value) => value.trim());

        return config;
    }

    private resolveFingerprint(fingerprint: string | null): string {
        return FINGERPRINTS.find((candidate) => fingerprint?.includes(candidate)) ?? 'chrome';
    }

    private renderConfig(
        template: Record<string, unknown>,
        userOutbounds: OutboundConfig[],
    ): string {
        const allOutbounds = [...(template.outbounds as OutboundConfig[]), ...userOutbounds];

        const urltestTags = allOutbounds
            .filter((o) => PROXY_PROTOCOL_TYPES.has(o.type))
            .map((o) => o.tag);

        const selectorTags = allOutbounds
            .filter((o) => SELECTOR_TYPES.has(o.type))
            .map((o) => o.tag);

        const finalOutbounds = allOutbounds.map((outbound) => {
            const { remnawave, ...cleanOutbound } = outbound;

            if (remnawave?.includeProxies === false) {
                return cleanOutbound;
            }
            if (cleanOutbound.type === 'urltest') {
                return { ...cleanOutbound, outbounds: urltestTags };
            }
            if (cleanOutbound.type === 'selector') {
                return { ...cleanOutbound, outbounds: selectorTags };
            }
            return cleanOutbound;
        });

        return JSON.stringify({ ...template, outbounds: finalOutbounds }, null, 0);
    }
}
