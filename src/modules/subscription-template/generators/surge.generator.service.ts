import { Injectable, Logger } from '@nestjs/common';

import { SubscriptionTemplateService } from '@modules/subscription-template/subscription-template.service';

import { ResolvedProxyConfig } from '../resolve-proxy/interfaces';

const PROXIES_PLACEHOLDER = '#!remnawave-proxies';
const PROXY_NAMES_PLACEHOLDER = '#!remnawave-proxy-names';
const UNSUPPORTED_TRANSPORTS = new Set(['hysteria', 'kcp', 'xhttp']);
const UNSUPPORTED_PROTOCOLS = new Set(['hysteria', 'hysteria2', 'shadowtls', 'tuic']);

@Injectable()
export class SurgeGeneratorService {
    private readonly logger = new Logger(SurgeGeneratorService.name);

    constructor(private readonly subscriptionTemplateService: SubscriptionTemplateService) {}

    public async generateConfig(
        hosts: ResolvedProxyConfig[],
        overrideTemplateName?: string,
    ): Promise<string> {
        try {
            const template = await this.subscriptionTemplateService.getCachedTextTemplateByType(
                'SURGE',
                overrideTemplateName,
            );

            const proxyLines: string[] = [];
            const proxyNames: string[] = [];

            for (const host of hosts) {
                if (host.metadata.excludeFromSubscriptionTypes.includes('SURGE')) continue;
                if (UNSUPPORTED_TRANSPORTS.has(host.transport)) continue;
                if (UNSUPPORTED_PROTOCOLS.has(host.protocol)) continue;
                if (host.security === 'reality') continue;
                if (host.protocol === 'anytls' && host.transport !== 'tcp') continue;

                const proxyLine = this.buildProxyLine(host);
                if (!proxyLine) continue;

                proxyLines.push(proxyLine);
                proxyNames.push(this.escapeListValue(host.finalRemark));
            }

            return this.renderTemplate(template, proxyLines, proxyNames);
        } catch (error) {
            this.logger.error('Error generating surge config:', error);
            return '';
        }
    }

    private buildProxyLine(host: ResolvedProxyConfig): string | null {
        const fields = this.buildProtocolFields(host);
        if (!fields) {
            return null;
        }

        // Surge does not support udp-relay for AnyTLS.
        if (host.protocol !== 'anytls') {
            fields.push(`udp-relay=${host.protocol === 'shadowsocks' ? 'true' : 'false'}`);
        }
        this.applySecurityFields(fields, host);
        this.applyTransportFields(fields, host);

        return `${this.escapeProxyName(host.finalRemark)} = ${fields.join(', ')}`;
    }

    private buildProtocolFields(host: ResolvedProxyConfig): string[] | null {
        switch (host.protocol) {
            case 'shadowsocks':
                return [
                    'ss',
                    host.address,
                    host.port.toString(),
                    `encrypt-method=${host.protocolOptions.method}`,
                    `password=${this.escapeFieldValue(host.protocolOptions.password)}`,
                ];

            case 'trojan':
                return [
                    'trojan',
                    host.address,
                    host.port.toString(),
                    `password=${this.escapeFieldValue(host.protocolOptions.password)}`,
                ];

            case 'vmess':
                return [
                    'vmess',
                    host.address,
                    host.port.toString(),
                    `username=${host.protocolOptions.uuid}`,
                    `alterId=${host.protocolOptions.alterId}`,
                    `vmess-aead=${host.protocolOptions.alterId === 0 ? 'true' : 'false'}`,
                ];

            case 'vless':
                if (host.protocolOptions.flow) {
                    return null;
                }

                return [
                    'vless',
                    host.address,
                    host.port.toString(),
                    `username=${host.protocolOptions.id}`,
                ];

            case 'anytls':
                return [
                    'anytls',
                    host.address,
                    host.port.toString(),
                    `password=${this.escapeFieldValue(host.protocolOptions.password)}`,
                ];

            default:
                return null;
        }
    }

    private applySecurityFields(fields: string[], host: ResolvedProxyConfig): void {
        switch (host.security) {
            case 'tls':
                // AnyTLS implies TLS in Surge; tls=true is not a valid parameter for it.
                if (host.protocol !== 'anytls') {
                    fields.push('tls=true');
                }

                if (host.securityOptions.serverName) {
                    fields.push(`sni=${this.escapeFieldValue(host.securityOptions.serverName)}`);
                }

                if (host.securityOptions.alpn) {
                    fields.push(`alpn=${this.escapeFieldValue(host.securityOptions.alpn)}`);
                }
                break;

            case 'none':
                break;
        }
    }

    private applyTransportFields(fields: string[], host: ResolvedProxyConfig): void {
        switch (host.transport) {
            case 'ws':
                fields.push('ws=true');
                this.applyWebSocketFields(
                    fields,
                    host.transportOptions.path,
                    host.transportOptions.host,
                );
                break;

            case 'httpupgrade':
                fields.push('ws=true');
                this.applyWebSocketFields(
                    fields,
                    host.transportOptions.path,
                    host.transportOptions.host,
                );
                break;

            case 'grpc':
                fields.push('grpc=true');
                if (host.transportOptions.serviceName) {
                    fields.push(
                        `grpc-service-name=${this.escapeFieldValue(host.transportOptions.serviceName)}`,
                    );
                }
                break;

            default:
                break;
        }
    }

    private applyWebSocketFields(
        fields: string[],
        rawPath: string | null,
        host: string | null,
    ): void {
        let path = rawPath ?? '';

        if (path.includes('?ed=')) {
            path = path.split('?ed=')[0];
        }

        if (path) {
            fields.push(`ws-path=${this.escapeFieldValue(path)}`);
        }

        if (host) {
            fields.push(`ws-headers=Host:${this.escapeFieldValue(host)}`);
        }
    }

    private renderTemplate(template: string, proxyLines: string[], proxyNames: string[]): string {
        const rendered = template
            .replace(PROXIES_PLACEHOLDER, proxyLines.join('\n'))
            .replace(PROXY_NAMES_PLACEHOLDER, proxyNames.join(', '));

        if (rendered !== template) {
            return rendered;
        }

        return [
            template.trimEnd(),
            '',
            '[Proxy]',
            ...proxyLines,
            '',
            '[Proxy Group]',
            `→ Remnawave = select, ${proxyNames.join(', ')}`,
            '',
            '[Rule]',
            'FINAL,→ Remnawave',
            '',
        ].join('\n');
    }

    private escapeProxyName(value: string): string {
        return value.replaceAll('\n', ' ').replaceAll('\r', ' ').trim();
    }

    private escapeListValue(value: string): string {
        return this.escapeProxyName(value).replaceAll(',', '\\,');
    }

    private escapeFieldValue(value: string): string {
        return value.replaceAll('\n', '').replaceAll('\r', '').replaceAll(',', '\\,');
    }
}
