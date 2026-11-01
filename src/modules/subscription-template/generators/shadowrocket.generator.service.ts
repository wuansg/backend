import { Injectable, Logger } from '@nestjs/common';

import { SubscriptionTemplateService } from '@modules/subscription-template/subscription-template.service';

import { ResolvedProxyConfig } from '../resolve-proxy/interfaces';

const PROXIES_PLACEHOLDER = '#!remnawave-proxies';
const PROXY_NAMES_PLACEHOLDER = '#!remnawave-proxy-names';
const SUPPORTED_TRANSPORTS = new Set(['tcp', 'ws']);

/**
 * Shadowrocket native profile (.conf).
 *
 * The profile normally carries only groups and rules, while nodes come from
 * the user's node subscription. `#!remnawave-proxy-names` lists the panel's
 * node names in a group (DIRECT when the user has none, so no group is left
 * empty). `#!remnawave-proxies` optionally embeds the nodes as local [Proxy]
 * lines.
 *
 * Shadowrocket documents local nodes only loosely, so [Proxy] lines are limited
 * to protocols and transports whose syntax is known to work and other hosts
 * are skipped instead of emitting lines Shadowrocket may misread.
 */
@Injectable()
export class ShadowrocketGeneratorService {
    private readonly logger = new Logger(ShadowrocketGeneratorService.name);

    constructor(private readonly subscriptionTemplateService: SubscriptionTemplateService) {}

    public async generateConfig(
        hosts: ResolvedProxyConfig[],
        overrideTemplateName?: string,
    ): Promise<string> {
        try {
            const template = await this.subscriptionTemplateService.getCachedTextTemplateByType(
                'SHADOWROCKET',
                overrideTemplateName,
            );

            const proxyLines: string[] = [];
            const proxyNames: string[] = [];

            for (const host of hosts) {
                if (host.metadata.excludeFromSubscriptionTypes.includes('SHADOWROCKET')) continue;

                const proxyLine = this.buildProxyLine(host);
                if (!proxyLine) continue;

                proxyLines.push(proxyLine);
                proxyNames.push(this.escapeListValue(host.finalRemark));
            }

            return renderShadowrocketTemplate(template, proxyLines, proxyNames);
        } catch (error) {
            this.logger.error('Error generating Shadowrocket config:', error);
            return '';
        }
    }

    private buildProxyLine(host: ResolvedProxyConfig): string | null {
        if (!SUPPORTED_TRANSPORTS.has(host.transport)) return null;
        if (host.security === 'reality') return null;

        const fields = this.buildProtocolFields(host);
        if (!fields) return null;

        this.applySecurityFields(fields, host);
        this.applyTransportFields(fields, host);

        return `${this.escapeProxyName(host.finalRemark)} = ${fields.join(',')}`;
    }

    private buildProtocolFields(host: ResolvedProxyConfig): string[] | null {
        const head = [host.address, host.port.toString()];

        switch (host.protocol) {
            case 'shadowsocks':
                if (host.security !== 'none') return null;
                return [
                    'ss',
                    ...head,
                    `method=${host.protocolOptions.method}`,
                    `password=${this.escapeFieldValue(host.protocolOptions.password)}`,
                    'udp=1',
                ];

            case 'trojan':
                if (host.security !== 'tls') return null;
                return [
                    'trojan',
                    ...head,
                    `password=${this.escapeFieldValue(host.protocolOptions.password)}`,
                ];

            case 'anytls':
                if (host.security !== 'tls' || host.transport !== 'tcp') return null;
                return [
                    'anytls',
                    ...head,
                    `password=${this.escapeFieldValue(host.protocolOptions.password)}`,
                ];

            case 'snell':
                if (host.security !== 'none' || host.transport !== 'tcp') return null;
                return [
                    'snell',
                    ...head,
                    `password=${this.escapeFieldValue(host.protocolOptions.psk)}`,
                    `version=${host.protocolOptions.version}`,
                    'udp=1',
                    ...(host.protocolOptions.obfs === 'http' ? ['obfs=http'] : []),
                ];

            case 'vless':
                if (host.protocolOptions.flow) return null;
                return [
                    'vless',
                    ...head,
                    `password=${host.protocolOptions.id}`,
                    ...(host.security === 'tls' ? ['tls=true'] : []),
                ];

            case 'vmess':
                return [
                    'vmess',
                    ...head,
                    `password=${host.protocolOptions.uuid}`,
                    `alterId=${host.protocolOptions.alterId}`,
                    'method=auto',
                    ...(host.security === 'tls' ? ['tls=true'] : []),
                ];

            default:
                return null;
        }
    }

    private applySecurityFields(fields: string[], host: ResolvedProxyConfig): void {
        if (host.security !== 'tls') return;

        if (host.securityOptions.serverName) {
            fields.push(`peer=${this.escapeFieldValue(host.securityOptions.serverName)}`);
        }
        if (host.securityOptions.alpn) {
            fields.push(`alpn=${this.escapeFieldValue(host.securityOptions.alpn)}`);
        }
    }

    private applyTransportFields(fields: string[], host: ResolvedProxyConfig): void {
        if (host.transport !== 'ws') return;

        fields.push('obfs=websocket');
        let path = host.transportOptions.path ?? '';
        if (path.includes('?ed=')) {
            path = path.split('?ed=')[0];
        }
        if (path) {
            fields.push(`obfs-uri=${this.escapeFieldValue(path)}`);
        }
        if (host.transportOptions.host) {
            fields.push(`obfs-host=${this.escapeFieldValue(host.transportOptions.host)}`);
        }
    }

    // A name must read the same in a [Proxy] line and in group member lists,
    // where ',' separates members and '=' ends the name.
    private escapeProxyName(value: string): string {
        return value
            .replaceAll('\n', ' ')
            .replaceAll('\r', ' ')
            .replaceAll(',', ' ')
            .replaceAll('=', '-')
            .trim();
    }

    private escapeListValue(value: string): string {
        return this.escapeProxyName(value);
    }

    private escapeFieldValue(value: string): string {
        return value.replaceAll('\n', '').replaceAll('\r', '').replaceAll(',', '\\,');
    }
}

export function renderShadowrocketTemplate(
    template: string,
    proxyLines: string[],
    proxyNames: string[],
): string {
    return template
        .replace(PROXIES_PLACEHOLDER, proxyLines.join('\n'))
        .replaceAll(
            PROXY_NAMES_PLACEHOLDER,
            proxyNames.length > 0 ? proxyNames.join(',') : 'DIRECT',
        );
}
