import assert from 'node:assert/strict';

import { SingBoxGeneratorService } from '@modules/subscription-template/generators/singbox.generator.service';
import { ResolvedProxyConfig } from '@modules/subscription-template/resolve-proxy/interfaces';
import { SubscriptionTemplateService } from '@modules/subscription-template/subscription-template.service';

function buildHost(overrides: Partial<ResolvedProxyConfig> = {}): ResolvedProxyConfig {
    return {
        finalRemark: 'mapped-vless',
        address: '203.0.113.10',
        port: 443,
        streamOverrides: { finalMask: null, sockopt: null },
        mux: {
            smux: {
                enabled: true,
                protocol: 'h2mux',
                'max-connections': 2,
                padding: true,
                'brutal-opts': { enabled: true, up: 50, down: 100 },
            },
        },
        clientOverrides: {
            shuffleHost: false,
            mihomoX25519: false,
            mihomoIpVersion: null,
            serverDescription: null,
            xrayJsonTemplate: null,
            mapper: {
                singbox: [
                    { op: 'copy', from: 'custom.resolver', to: 'domain_resolver' },
                    { op: 'set', to: 'tcp_fast_open', value: true },
                ],
            },
        },
        metadata: {
            uuid: '00000000-0000-0000-0000-000000000001',
            tags: [],
            excludeFromSubscriptionTypes: [],
            inboundTag: 'vless-inbound',
            configProfileUuid: null,
            configProfileInboundUuid: null,
            isDisabled: false,
            isHidden: false,
            viewPosition: 1,
            remark: 'mapped-vless',
            vlessRouteId: null,
            rawInbound: { custom: { resolver: 'local' } },
        },
        protocol: 'vless',
        protocolOptions: {
            id: '00000000-0000-0000-0000-000000000002',
            encryption: 'none',
            flow: 'xtls-rprx-vision',
        },
        security: 'tls',
        securityOptions: {
            pinnedPeerCertSha256: null,
            verifyPeerCertByName: null,
            alpn: 'h2,http/1.1',
            enableSessionResumption: false,
            fingerprint: 'chrome',
            serverName: 'edge.example.com',
            echConfigList: null,
            echForceQuery: null,
            echSockopt: null,
            cipherSuites: null,
        },
        transport: 'ws',
        transportOptions: {
            path: '/ws?ed=2048',
            host: 'ws.example.com',
            headers: { Origin: 'https://origin.example.com', Host: 'ignored.example.com' },
            heartbeatPeriod: null,
        },
        ...overrides,
    } as ResolvedProxyConfig;
}

async function main(): Promise<void> {
    const templates = {
        getCachedTemplateByType: async () => ({
            outbounds: [{ type: 'selector', tag: 'AUTO' }],
        }),
    } as SubscriptionTemplateService;
    const service = new SingBoxGeneratorService(templates);

    const invalidEncryption = buildHost({
        finalRemark: 'invalid-encryption',
        protocolOptions: {
            id: '00000000-0000-0000-0000-000000000003',
            encryption: 'mlkem768x25519plus.native.0rtt',
            flow: '',
        },
    });

    const result = JSON.parse(await service.generateConfig([buildHost(), invalidEncryption])) as {
        outbounds: Array<Record<string, unknown>>;
    };
    const outbound = result.outbounds.find((item) => item.tag === 'mapped-vless');

    assert.ok(outbound);
    assert.equal(outbound.flow, undefined, 'Vision must not be emitted for WebSocket');
    assert.equal(outbound.domain_resolver, 'local');
    assert.equal(outbound.tcp_fast_open, true);
    assert.deepEqual(outbound.multiplex, {
        enabled: true,
        protocol: 'h2mux',
        max_connections: 2,
        padding: true,
        brutal: { enabled: true, up_mbps: 50, down_mbps: 100 },
    });

    const transport = outbound.transport as Record<string, unknown>;
    assert.equal(transport.path, '/ws');
    assert.equal(transport.max_early_data, 2048);
    assert.deepEqual(transport.headers, {
        Origin: 'https://origin.example.com',
        Host: 'ws.example.com',
    });
    assert.equal(
        result.outbounds.some((item) => item.tag === 'invalid-encryption'),
        false,
    );

    process.stdout.write('sing-box subscription generator validation passed\n');
}

void main();
