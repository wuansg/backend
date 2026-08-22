import assert from 'node:assert/strict';

import { HostMapperSchema } from '@libs/contracts/models';

import { applyHostMapper } from '@modules/subscription-template/host-mapper';
import { ResolvedProxyConfig } from '@modules/subscription-template/resolve-proxy/interfaces';

const host = {
    finalRemark: 'preview-host',
    address: '198.51.100.10',
    port: 443,
    protocol: 'anytls',
    protocolOptions: { password: 'secret' },
    transport: 'tcp',
    transportOptions: { header: null },
    security: 'tls',
    securityOptions: { serverName: 'edge.example.com' },
    mux: null,
    streamOverrides: { finalMask: null, sockopt: null },
    clientOverrides: {
        mapper: {},
        shuffleHost: false,
        mihomoX25519: false,
        mihomoIpVersion: null,
        serverDescription: null,
        xrayJsonTemplate: null,
    },
    metadata: {
        uuid: '00000000-0000-4000-8000-000000000001',
        tags: ['edge'],
        excludeFromSubscriptionTypes: [],
        inboundTag: 'anytls-in',
        configProfileUuid: null,
        configProfileInboundUuid: null,
        isDisabled: false,
        isHidden: false,
        viewPosition: 0,
        remark: 'preview-host',
        vlessRouteId: null,
        rawInbound: {
            tls: { min_version: '1.3' },
            custom: { resolver: 'local' },
        },
    },
} as unknown as ResolvedProxyConfig;

const mapper = HostMapperSchema.parse({
    singbox: [
        { op: 'copy', from: 'custom.resolver', to: 'domain_resolver' },
        { op: 'copy', from: '$host.securityOptions.serverName', to: 'tls.server_name' },
        { op: 'set', to: 'tcp_fast_open', value: true },
        { op: 'unset', to: 'multiplex' },
    ],
    mihomo: [{ op: 'set', to: 'ip-version', value: 'ipv4' }],
    base64: [{ op: 'set', to: 'fp', value: 'chrome' }],
    xrayJson: [{ op: 'unset', to: 'mux' }],
});

const result = applyHostMapper(
    {
        type: 'anytls',
        tag: 'preview-host',
        tls: { enabled: true },
        multiplex: { enabled: true },
    },
    mapper.singbox,
    host,
);

assert.deepEqual(result, {
    type: 'anytls',
    tag: 'preview-host',
    tls: { enabled: true, server_name: 'edge.example.com' },
    domain_resolver: 'local',
    tcp_fast_open: true,
});

const protectedResult = applyHostMapper(
    {},
    [
        { op: 'set', to: '__proto__.polluted', value: true },
        { op: 'copy', from: 'constructor.prototype', to: 'unsafe' },
    ],
    host,
);

assert.deepEqual(protectedResult, {});
assert.equal(({} as Record<string, unknown>).polluted, undefined);

process.stdout.write('Host Mapper schema, mapping and path safety validation passed\n');
