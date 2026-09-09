import assert from 'node:assert/strict';

import { HostMapperSchema } from '@libs/contracts/models';

import { XrayGeneratorService } from '@modules/subscription-template/generators/xray.generator.service';
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

const generator = new XrayGeneratorService();

const mappedAnyTls = {
    ...host,
    clientOverrides: {
        ...host.clientOverrides,
        mapper: {
            base64: [
                { op: 'set' as const, to: '$link.address', value: '2001:db8::5' },
                { op: 'set' as const, to: '$link.port', value: 8443 },
                { op: 'set' as const, to: '$link.password', value: 'mapped password' },
                { op: 'set' as const, to: '$link.remark', value: 'Mapped AnyTLS' },
                { op: 'set' as const, to: 'fp', value: 'firefox' },
            ],
        },
    },
} as ResolvedProxyConfig;

assert.equal(
    generator.generateLinks([mappedAnyTls], false)[0],
    'anytls://mapped%20password@[2001:db8::5]:8443?sni=edge.example.com&fp=firefox#Mapped%20AnyTLS',
);

const invalidLinkValues = {
    ...host,
    clientOverrides: {
        ...host.clientOverrides,
        mapper: {
            base64: [
                { op: 'set' as const, to: '$link.address', value: 'https://invalid.example' },
                { op: 'set' as const, to: '$link.port', value: 70_000 },
                { op: 'set' as const, to: '$link.password', value: '' },
            ],
        },
    },
} as ResolvedProxyConfig;

assert.match(
    generator.generateLinks([invalidLinkValues], false)[0],
    /^anytls:\/\/secret@198\.51\.100\.10:443\?/,
);

const mappedShadowsocks = {
    ...host,
    protocol: 'shadowsocks',
    protocolOptions: {
        method: 'aes-128-gcm',
        password: 'original-ss',
        uot: false,
        uotVersion: 2,
    },
    security: 'none',
    clientOverrides: {
        ...host.clientOverrides,
        mapper: {
            base64: [
                { op: 'set' as const, to: '$link.method', value: 'chacha20-ietf-poly1305' },
                { op: 'set' as const, to: '$link.password', value: 'mapped-ss' },
            ],
        },
    },
} as unknown as ResolvedProxyConfig;

const shadowsocksLink = generator.generateLinks([mappedShadowsocks], false)[0];
const encodedCredentials = shadowsocksLink.slice('ss://'.length, shadowsocksLink.indexOf('@'));
assert.equal(
    Buffer.from(encodedCredentials, 'base64').toString(),
    'chacha20-ietf-poly1305:mapped-ss',
);

const mappedHysteria2 = {
    ...host,
    protocol: 'hysteria2',
    protocolOptions: { password: 'original-hy2' },
    clientOverrides: {
        ...host.clientOverrides,
        mapper: {
            base64: [{ op: 'set' as const, to: '$link.password', value: 'mapped-hy2' }],
        },
    },
} as unknown as ResolvedProxyConfig;
assert.match(generator.generateLinks([mappedHysteria2], false)[0], /^hysteria2:\/\/mapped-hy2@/);

const mappedTuic = {
    ...host,
    protocol: 'tuic',
    protocolOptions: {
        uuid: '00000000-0000-4000-8000-000000000009',
        password: 'original-tuic',
        congestionControl: 'bbr',
        udpRelayMode: 'native',
        heartbeat: null,
        zeroRtt: false,
    },
    clientOverrides: {
        ...host.clientOverrides,
        mapper: {
            base64: [{ op: 'set' as const, to: '$link.password', value: 'mapped-tuic' }],
        },
    },
} as unknown as ResolvedProxyConfig;
assert.match(
    generator.generateLinks([mappedTuic], false)[0],
    /^tuic:\/\/00000000-0000-4000-8000-000000000009:mapped-tuic@/,
);

process.stdout.write('Host Mapper schema, link mapping and path safety validation passed\n');
