import assert from 'node:assert/strict';

import { SingBoxConfig } from '@common/helpers/sing-box-config';

import { UserForConfigEntity } from '@modules/users/entities/users-for-config';

type SingBoxInbound = {
    type: string;
    tag: string;
    listen: string;
    listen_port: number;
    users: Array<Record<string, unknown>>;
    tls?: {
        enabled: boolean;
        certificate_path: string;
        key_path: string;
    };
    method?: string;
    congestion_control?: string;
    version?: number;
    handshake?: {
        server: string;
        server_port: number;
    };
};

function buildDefaultSingBoxConfig(): {
    inbounds: SingBoxInbound[];
    outbounds: unknown[];
    log: { level: string };
    route: { final: string; rules: unknown[] };
} {
    const suffix = 'test';

    return {
        log: {
            level: 'info',
        },
        inbounds: [
            {
                type: 'anytls',
                tag: `AnyTLS_${suffix}`,
                listen: '::',
                listen_port: 54321,
                users: [],
                tls: {
                    enabled: true,
                    certificate_path: '/root/cert/anytls/cert.pem',
                    key_path: '/root/cert/anytls/cert.key',
                },
            },
            {
                type: 'vless',
                tag: `VLESS_${suffix}`,
                listen: '::',
                listen_port: 54322,
                users: [],
            },
            {
                type: 'vmess',
                tag: `VMess_${suffix}`,
                listen: '::',
                listen_port: 54323,
                users: [],
            },
            {
                type: 'trojan',
                tag: `Trojan_${suffix}`,
                listen: '::',
                listen_port: 54324,
                users: [],
                tls: {
                    enabled: true,
                    certificate_path: '/root/cert/anytls/cert.pem',
                    key_path: '/root/cert/anytls/cert.key',
                },
            },
            {
                type: 'shadowsocks',
                tag: `Shadowsocks_${suffix}`,
                listen: '::',
                listen_port: 54325,
                method: 'chacha20-ietf-poly1305',
                users: [],
            },
            {
                type: 'hysteria2',
                tag: `Hysteria2_${suffix}`,
                listen: '::',
                listen_port: 54326,
                users: [],
                tls: {
                    enabled: true,
                    certificate_path: '/root/cert/anytls/cert.pem',
                    key_path: '/root/cert/anytls/cert.key',
                },
            },
            {
                type: 'tuic',
                tag: `TUIC_${suffix}`,
                listen: '::',
                listen_port: 54327,
                users: [],
                congestion_control: 'bbr',
                tls: {
                    enabled: true,
                    certificate_path: '/root/cert/anytls/cert.pem',
                    key_path: '/root/cert/anytls/cert.key',
                },
            },
            {
                type: 'shadowtls',
                tag: `ShadowTLS_${suffix}`,
                listen: '::',
                listen_port: 54328,
                users: [],
                version: 3,
                handshake: {
                    server: 'www.cloudflare.com',
                    server_port: 443,
                },
            },
        ],
        outbounds: [
            { tag: 'DIRECT', type: 'direct' },
            { tag: 'BLOCK', type: 'block' },
        ],
        route: {
            final: 'DIRECT',
            rules: [],
        },
    };
}

function buildUsers(): UserForConfigEntity[] {
    return [
        new UserForConfigEntity({
            tId: 1n,
            tags: ['AnyTLS_test'],
            trojanPassword: 'trojan-1',
            vlessUuid: '00000000-0000-0000-0000-000000000001',
            ssPassword: 'ss-1',
            anytlsPassword: 'anytls-1',
        }),
        new UserForConfigEntity({
            tId: 2n,
            tags: ['VLESS_test'],
            trojanPassword: 'trojan-2',
            vlessUuid: '00000000-0000-0000-0000-000000000002',
            ssPassword: 'ss-2',
            anytlsPassword: 'anytls-2',
        }),
        new UserForConfigEntity({
            tId: 3n,
            tags: ['VMess_test'],
            trojanPassword: 'trojan-3',
            vlessUuid: '00000000-0000-0000-0000-000000000003',
            ssPassword: 'ss-3',
            anytlsPassword: 'anytls-3',
        }),
        new UserForConfigEntity({
            tId: 4n,
            tags: ['Trojan_test'],
            trojanPassword: 'trojan-4',
            vlessUuid: '00000000-0000-0000-0000-000000000004',
            ssPassword: 'ss-4',
            anytlsPassword: 'anytls-4',
        }),
        new UserForConfigEntity({
            tId: 5n,
            tags: ['Shadowsocks_test'],
            trojanPassword: 'trojan-5',
            vlessUuid: '00000000-0000-0000-0000-000000000005',
            ssPassword: 'ss-5',
            anytlsPassword: 'anytls-5',
        }),
        new UserForConfigEntity({
            tId: 6n,
            tags: ['Hysteria2_test'],
            trojanPassword: 'trojan-6',
            vlessUuid: '00000000-0000-0000-0000-000000000006',
            ssPassword: 'ss-6',
            anytlsPassword: 'anytls-6',
        }),
        new UserForConfigEntity({
            tId: 7n,
            tags: ['TUIC_test'],
            trojanPassword: 'trojan-7',
            vlessUuid: '00000000-0000-0000-0000-000000000007',
            ssPassword: 'ss-7',
            anytlsPassword: 'anytls-7',
        }),
        new UserForConfigEntity({
            tId: 8n,
            tags: ['ShadowTLS_test'],
            trojanPassword: 'trojan-8',
            vlessUuid: '00000000-0000-0000-0000-000000000008',
            ssPassword: 'ss-8',
            anytlsPassword: 'anytls-8',
        }),
    ];
}

function main() {
    const normalizedAliases = new SingBoxConfig({
        inbounds: [
            {
                type: 'anytls',
                tag: 'alias-test',
                listenPort: 8443,
                listen_port: 443,
                users: [],
                tls: {
                    minVersion: '1.1',
                    min_version: '1.2',
                },
            },
        ],
    }).getConfig() as Record<string, unknown>;
    const aliasInbound = (normalizedAliases.inbounds as Array<Record<string, unknown>>)[0];
    const aliasTls = aliasInbound.tls as Record<string, unknown>;
    assert.equal(aliasInbound.listen_port, 443);
    assert.ok(!Object.hasOwn(aliasInbound, 'listenPort'));
    assert.equal(aliasTls.min_version, '1.2');
    assert.ok(!Object.hasOwn(aliasTls, 'minVersion'));

    const config = buildDefaultSingBoxConfig();
    const helper = new SingBoxConfig(config);

    const inbounds = helper.getAllInbounds();
    assert.equal(inbounds.length, 8);
    assert.deepEqual(
        inbounds.map((inbound) => inbound.tag),
        [
            'AnyTLS_test',
            'VLESS_test',
            'VMess_test',
            'Trojan_test',
            'Shadowsocks_test',
            'Hysteria2_test',
            'TUIC_test',
            'ShadowTLS_test',
        ],
    );

    helper.cleanInboundClients();
    helper.includeUserBatch(buildUsers(), new Map());

    const { inbounds: managedInbounds } = helper.getConfig();
    assert.ok(Array.isArray(managedInbounds));

    const inboundByTag = new Map(
        managedInbounds!.map((inbound) => [
            inbound.tag as string,
            inbound as Record<string, unknown>,
        ]),
    );

    assert.equal(
        (inboundByTag.get('AnyTLS_test')?.users as Array<Record<string, unknown>>)?.[0]?.password,
        'anytls-1',
    );
    assert.equal(
        (inboundByTag.get('VLESS_test')?.users as Array<Record<string, unknown>>)?.[0]?.uuid,
        '00000000-0000-0000-0000-000000000002',
    );
    assert.equal(
        (inboundByTag.get('VMess_test')?.users as Array<Record<string, unknown>>)?.[0]?.uuid,
        '00000000-0000-0000-0000-000000000003',
    );
    assert.equal(
        (inboundByTag.get('Trojan_test')?.users as Array<Record<string, unknown>>)?.[0]?.password,
        'trojan-4',
    );
    assert.equal(
        (inboundByTag.get('Shadowsocks_test')?.users as Array<Record<string, unknown>>)?.[0]
            ?.password,
        'ss-5',
    );
    assert.equal(
        (inboundByTag.get('Hysteria2_test')?.users as Array<Record<string, unknown>>)?.[0]
            ?.password,
        '00000000-0000-0000-0000-000000000006',
    );
    assert.equal(
        (inboundByTag.get('TUIC_test')?.users as Array<Record<string, unknown>>)?.[0]?.uuid,
        '00000000-0000-0000-0000-000000000007',
    );
    assert.equal(
        (inboundByTag.get('ShadowTLS_test')?.users as Array<Record<string, unknown>>)?.[0]
            ?.password,
        'trojan-8',
    );

    if (process.argv.includes('--print-config')) {
        process.stdout.write(`${JSON.stringify(helper.getConfig())}\n`);
        return;
    }

    process.stdout.write('sing-box all-protocol config validation passed\n');
}

main();
