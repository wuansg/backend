import assert from 'node:assert/strict';

import { DEFAULT_TEMPLATE_SHADOWROCKET } from '@modules/subscription-template/constants/default-templates';
import { ShadowrocketGeneratorService } from '@modules/subscription-template/generators/shadowrocket.generator.service';
import { ResolvedProxyConfig } from '@modules/subscription-template/resolve-proxy/interfaces';

const TLS_OPTIONS = {
    alpn: null,
    enableSessionResumption: false,
    fingerprint: null,
    serverName: null,
    pinnedPeerCertSha256: null,
    verifyPeerCertByName: null,
    echConfigList: null,
    echForceQuery: null,
    echSockopt: null,
    cipherSuites: null,
};

function host(overrides: Partial<ResolvedProxyConfig>): ResolvedProxyConfig {
    return {
        finalRemark: 'node',
        address: '203.0.113.10',
        port: 443,
        streamOverrides: { finalMask: null, sockopt: null },
        mux: null,
        clientOverrides: {
            shuffleHost: false,
            mihomoX25519: false,
            mihomoIpVersion: null,
            serverDescription: null,
            mapper: {},
        },
        metadata: {
            uuid: 'host-uuid',
            tags: [],
            excludeFromSubscriptionTypes: [],
            inboundTag: 'inbound-tag',
            configProfileUuid: 'profile-uuid',
            configProfileInboundUuid: 'profile-inbound-uuid',
            isDisabled: false,
            isHidden: false,
            viewPosition: 0,
            remark: 'node',
            vlessRouteId: null,
            rawInbound: null,
        },
        protocol: 'trojan',
        protocolOptions: { password: 'trojan-password' },
        security: 'tls',
        securityOptions: { ...TLS_OPTIONS },
        transport: 'tcp',
        transportOptions: { header: null },
        ...overrides,
    } as ResolvedProxyConfig;
}

function generator(template: string): ShadowrocketGeneratorService {
    return new ShadowrocketGeneratorService({
        getCachedTextTemplateByType: async (type: string) => {
            assert.equal(type, 'SHADOWROCKET');
            return template;
        },
    } as never);
}

const hosts = [
    host({
        finalRemark: '🇭🇰 hkg | dmit',
        securityOptions: { ...TLS_OPTIONS, serverName: 'sni.example.com' },
        transport: 'ws',
        transportOptions: { path: '/ws?ed=2048', host: 'cdn.example.com' },
    } as Partial<ResolvedProxyConfig>),
    host({
        finalRemark: '🇩🇪 fra | aiyun',
        protocol: 'anytls',
        protocolOptions: { password: 'any,pass' },
        securityOptions: { ...TLS_OPTIONS, serverName: 'fra.example.com' },
    } as Partial<ResolvedProxyConfig>),
    host({
        finalRemark: '🇭🇰 hkg | ali',
        port: 54320,
        protocol: 'snell',
        protocolOptions: { psk: 'snell-psk', version: 5, obfs: 'none' },
        security: 'none',
        securityOptions: null,
    } as unknown as Partial<ResolvedProxyConfig>),
    host({
        finalRemark: '🇹🇼 tpe | po0',
        protocol: 'shadowsocks',
        protocolOptions: { method: 'aes-128-gcm', password: 'ss', uot: false, uotVersion: 0 },
        security: 'none',
        securityOptions: null,
    } as unknown as Partial<ResolvedProxyConfig>),
    // Skipped: REALITY, gRPC and hosts excluded from Shadowrocket.
    host({ finalRemark: 'reality', security: 'reality' } as Partial<ResolvedProxyConfig>),
    host({
        finalRemark: 'grpc',
        transport: 'grpc',
        transportOptions: { serviceName: 'svc' },
    } as Partial<ResolvedProxyConfig>),
    host({
        finalRemark: 'excluded',
        metadata: {
            ...host({}).metadata,
            excludeFromSubscriptionTypes: ['SHADOWROCKET'],
        },
    }),
];

async function main() {
    const embedded = await generator(
        '[Proxy]\n#!remnawave-proxies\n\n[Proxy Group]\nG = select,#!remnawave-proxy-names\n',
    ).generateConfig(hosts);
    assert.equal(
        embedded,
        [
            '[Proxy]',
            '🇭🇰 hkg | dmit = trojan,203.0.113.10,443,password=trojan-password,peer=sni.example.com,obfs=websocket,obfs-uri=/ws,obfs-host=cdn.example.com',
            '🇩🇪 fra | aiyun = anytls,203.0.113.10,443,password=any\\,pass,peer=fra.example.com',
            '🇭🇰 hkg | ali = snell,203.0.113.10,54320,password=snell-psk,version=5,udp=1',
            '🇹🇼 tpe | po0 = ss,203.0.113.10,443,method=aes-128-gcm,password=ss,udp=1',
            '',
            '[Proxy Group]',
            'G = select,🇭🇰 hkg | dmit,🇩🇪 fra | aiyun,🇭🇰 hkg | ali,🇹🇼 tpe | po0',
            '',
        ].join('\n'),
    );

    // Names must match between [Proxy] lines and member lists.
    const awkward = await generator(
        '[Proxy]\n#!remnawave-proxies\nG = select,#!remnawave-proxy-names',
    ).generateConfig([host({ finalRemark: ' a,b=c ' })]);
    assert.match(awkward, /^a b-c = trojan,/m);
    assert.match(awkward, /^G = select,a b-c$/m);

    const profile = await generator(DEFAULT_TEMPLATE_SHADOWROCKET).generateConfig(hosts);
    assert.doesNotMatch(profile, /#!remnawave/);
    assert.doesNotMatch(
        profile,
        /^\[Proxy\]$/m,
        'Default profile leaves nodes to the subscription',
    );
    assert.match(
        profile,
        /^APAC = url-test,🇭🇰 hkg \| dmit,🇩🇪 fra \| aiyun,🇭🇰 hkg \| ali,🇹🇼 tpe \| po0,interval=600,/m,
    );
    assert.match(
        profile,
        /^Telegram = url-test,interval=600,.*policy-regex-filter=\(\?i\)hkg\|sin\|tyo/m,
    );
    assert.match(profile, /^FINAL,APAC$/m);
    assert.doesNotMatch(
        profile,
        /GEOSITE|MATCH,|DOMAIN-REGEX|GEOIP,PRIVATE/,
        'Shadowrocket has no such rules',
    );

    const sections = profile.match(/^\[[^\]]+\]$/gm);
    assert.deepEqual(sections, ['[General]', '[Proxy Group]', '[Rule]']);
    const groupLines = profile
        .split('[Proxy Group]')[1]
        .split('[Rule]')[0]
        .split('\n')
        .filter((line) => line.trim());
    for (const line of groupLines) {
        assert.match(line, /^[^=,]+ = (select|url-test|fallback|load-balance|random),\S/, line);
        assert.doesNotMatch(line, /,,|,$/, line);
    }
    const ruleLines = profile
        .split('[Rule]')[1]
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('#'));
    const groups = new Set(groupLines.map((line) => line.split(' = ')[0]));
    for (const line of ruleLines) {
        const fields = line.split(',');
        const policy = line.startsWith('FINAL,') ? fields[1] : fields[2];
        assert.ok(
            ['DIRECT', 'REJECT'].includes(policy) || groups.has(policy),
            `Rule targets an unknown policy: ${line}`,
        );
    }

    // No nodes: groups fall back to DIRECT instead of being left empty.
    const empty = await generator(DEFAULT_TEMPLATE_SHADOWROCKET).generateConfig([]);
    assert.match(empty, /^APAC = url-test,DIRECT,interval=600,/m);
    assert.match(empty, /^speedtest = select,DIRECT$/m);

    console.log('Shadowrocket generator: profile, embedded nodes and empty fallback tests passed');
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
