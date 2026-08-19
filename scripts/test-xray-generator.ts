import assert from 'node:assert/strict';

import { XrayGeneratorService } from '@modules/subscription-template/generators/xray.generator.service';
import { ResolvedProxyConfig } from '@modules/subscription-template/resolve-proxy/interfaces';

function buildBaseHost(overrides: Partial<ResolvedProxyConfig>): ResolvedProxyConfig {
    return {
        finalRemark: 'node',
        address: '203.0.113.10',
        port: 443,
        streamOverrides: {
            finalMask: null,
            sockopt: null,
        },
        mux: null,
        clientOverrides: {
            shuffleHost: false,
            mihomoX25519: false,
            mihomoIpVersion: null,
            serverDescription: null,
            xrayJsonTemplate: null,
            mapper: {},
        },
        metadata: {
            uuid: 'host-uuid',
            tags: ['host-tag'],
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
        protocol: 'anytls',
        protocolOptions: {
            password: 'anytls-password',
        },
        security: 'tls',
        securityOptions: {
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
        },
        transport: 'tcp',
        transportOptions: {
            header: null,
        },
        ...overrides,
    } as ResolvedProxyConfig;
}

function parseLink(link: string): URL {
    return new URL(link);
}

function main() {
    const service = new XrayGeneratorService();

    const anyTlsWithTlsParams = buildBaseHost({
        finalRemark: 'anytls-with-tls-params',
        address: '198.51.100.1',
        protocol: 'anytls',
        protocolOptions: {
            password: 'anytls-secret',
        },
        security: 'tls',
        securityOptions: {
            alpn: 'h2,http/1.1',
            enableSessionResumption: false,
            fingerprint: 'firefox',
            serverName: 'edge.example.com',
            pinnedPeerCertSha256: null,
            verifyPeerCertByName: null,
            echConfigList: null,
            echForceQuery: null,
            echSockopt: null,
            cipherSuites: null,
        },
    });

    const anyTlsWithoutSni = buildBaseHost({
        finalRemark: 'anytls-empty-sni',
        address: '198.51.100.2',
        protocol: 'anytls',
        protocolOptions: {
            password: 'blank-sni-secret',
        },
        security: 'tls',
        securityOptions: {
            alpn: null,
            enableSessionResumption: false,
            fingerprint: null,
            serverName: '',
            pinnedPeerCertSha256: null,
            verifyPeerCertByName: null,
            echConfigList: null,
            echForceQuery: null,
            echSockopt: null,
            cipherSuites: null,
        },
    });

    const vlessReference = buildBaseHost({
        finalRemark: 'vless-reference',
        protocol: 'vless',
        protocolOptions: {
            encryption: 'none',
            flow: '',
            id: '00000000-0000-0000-0000-000000000001',
        },
        security: 'tls',
        securityOptions: {
            alpn: null,
            enableSessionResumption: false,
            fingerprint: 'chrome',
            serverName: 'vless.example.com',
            pinnedPeerCertSha256: null,
            verifyPeerCertByName: null,
            echConfigList: null,
            echForceQuery: null,
            echSockopt: null,
            cipherSuites: 'TLS_AES_128_GCM_SHA256',
        },
        clientOverrides: {
            shuffleHost: false,
            mihomoX25519: false,
            mihomoIpVersion: null,
            serverDescription: null,
            xrayJsonTemplate: null,
            mapper: {
                base64: [{ op: 'set', to: 'mapped', value: 'yes' }],
            },
        },
    });

    const links = service.generateLinks(
        [anyTlsWithTlsParams, anyTlsWithoutSni, vlessReference],
        false,
    );

    assert.equal(links.length, 3);

    const anyTlsUrl = parseLink(links[0]);
    assert.equal(anyTlsUrl.protocol, 'anytls:');
    assert.equal(anyTlsUrl.username, 'anytls-secret');
    assert.equal(anyTlsUrl.searchParams.get('sni'), 'edge.example.com');
    assert.equal(anyTlsUrl.searchParams.get('fp'), 'firefox');
    assert.equal(anyTlsUrl.searchParams.get('alpn'), 'h2,http/1.1');

    const blankSniUrl = parseLink(links[1]);
    assert.equal(blankSniUrl.protocol, 'anytls:');
    assert.equal(blankSniUrl.searchParams.has('sni'), false);
    assert.equal(blankSniUrl.searchParams.has('insecure'), false);
    assert.equal(blankSniUrl.searchParams.has('allowInsecure'), false);
    assert.equal(blankSniUrl.searchParams.has('fp'), false);

    const vlessUrl = parseLink(links[2]);
    assert.equal(vlessUrl.protocol, 'vless:');
    assert.equal(vlessUrl.searchParams.get('type'), 'tcp');
    assert.equal(vlessUrl.searchParams.get('security'), 'tls');
    assert.equal(vlessUrl.searchParams.get('sni'), 'vless.example.com');
    assert.equal(vlessUrl.searchParams.get('fp'), 'chrome');
    assert.equal(vlessUrl.searchParams.get('cs'), 'TLS_AES_128_GCM_SHA256');
    assert.equal(vlessUrl.searchParams.get('mapped'), 'yes');

    const base64Config = service.generateConfig([anyTlsWithTlsParams], true, false);

    return base64Config.then((result) => {
        const decoded = Buffer.from(result, 'base64').toString('utf8');
        assert.match(decoded, /anytls:\/\/anytls-secret@198\.51\.100\.1:443\?/);
        assert.match(decoded, /sni=edge\.example\.com/);
        process.stdout.write('xray generator anytls link validation passed\n');
    });
}

void main();
