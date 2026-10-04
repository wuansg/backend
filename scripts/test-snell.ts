import { load } from 'js-yaml';
import assert from 'node:assert/strict';

import { AddNodeUserRequest, AddNodeUsersRequest } from '@common/axios/node-user-requests';
import { SingBoxConfig } from '@common/helpers/sing-box-config';
import { getSnellPsk, assertSnellAgentCompatibility } from '@common/helpers/snell';
import { ResolvedProxyConfigSchema } from '@libs/contracts/models';

import { HostWithRawInbound } from '@modules/hosts/entities/host-with-inbound-tag.entity';
import { AddUserToNodeEvent } from '@modules/nodes/events/add-user-to-node/add-user-to-node.event';
import { AddUserToNodeHandler } from '@modules/nodes/events/add-user-to-node/add-user-to-node.handler';
import { AddUsersToNodeEvent } from '@modules/nodes/events/add-users-to-node/add-users-to-node.event';
import { AddUsersToNodeHandler } from '@modules/nodes/events/add-users-to-node/add-users-to-node.handler';
import { SubscriptionSettingsEntity } from '@modules/subscription-settings/entities';
import { Base64GeneratorService } from '@modules/subscription-template/generators/base64.generator.service';
import { MihomoGeneratorService } from '@modules/subscription-template/generators/mihomo.generator.service';
import { SingBoxGeneratorService } from '@modules/subscription-template/generators/singbox.generator.service';
import { SurgeGeneratorService } from '@modules/subscription-template/generators/surge.generator.service';
import { ResolvedProxyConfig } from '@modules/subscription-template/resolve-proxy/interfaces';
import { ResolveProxyConfigService } from '@modules/subscription-template/resolve-proxy/resolve-proxy-config.service';
import { SubscriptionTemplateService } from '@modules/subscription-template/subscription-template.service';
import { UserForConfigEntity } from '@modules/users/entities/users-for-config';

async function main(): Promise<void> {
    assert.throws(() => assertSnellAgentCompatibility([{ type: 'snell' }], '3.13.0'));
    assert.doesNotThrow(() => assertSnellAgentCompatibility([{ type: 'snell' }], '3.14.0'));
    assert.doesNotThrow(() => assertSnellAgentCompatibility([{ type: 'anytls' }], '3.13.0'));
    const raw = {
        type: 'snell',
        tag: 'snell',
        listen_port: 54320,
        version: 5,
        multi_user_psk: true,
        users: [],
    };
    const user = new UserForConfigEntity({
        id: 18n,
        anytlsPassword: 'test-user-secret',
        vlessUuid: 'uuid',
        trojanPassword: 'trojan',
        ssPassword: 'ss',
        tags: ['snell'],
    });
    const psk = getSnellPsk(user);
    assert.equal(psk.length, 43);
    const inbounds = ['snell', 'anytls', 'tuic'].map((type) => ({
        type,
        tag: type,
        rawInbound: {},
    }));
    const resolvedUser = { ...user, inbounds };
    const nodes = {
        findConnectedNodes: async () => [
            { activeInbounds: inbounds, activeConfigProfileUuid: 'profile' },
        ],
    };
    let single: AddNodeUserRequest | undefined;
    let bulk: AddNodeUsersRequest | undefined;
    const queues = {
        addUserToNode: async (payload: { data: AddNodeUserRequest }) => {
            single = payload.data;
        },
        addUsersToNode: async (payload: { data: AddNodeUsersRequest }) => {
            bulk = payload.data;
        },
    };
    await new AddUserToNodeHandler(
        nodes as never,
        queues as never,
        { execute: async () => ({ isOk: true, response: resolvedUser }) } as never,
    ).handle(new AddUserToNodeEvent(18n));
    assert.ok(single);
    assert.equal(
        (single.data.find((entry) => entry.type === 'snell') as { password: string }).password,
        psk,
    );
    assert.equal(
        (single.data.find((entry) => entry.type === 'tuic') as { password: string }).password,
        user.trojanPassword,
    );
    await new AddUsersToNodeHandler(
        nodes as never,
        queues as never,
        { execute: async () => ({ isOk: true, response: [resolvedUser] }) } as never,
    ).handle(new AddUsersToNodeEvent([18n]));
    assert.equal(bulk?.users[0].userData.snellPsk, psk);
    assert.equal(bulk?.users[0].inboundData[0].type, 'snell');
    assert.notEqual(psk, getSnellPsk({ anytlsPassword: 'rotated-secret' }));
    assert.throws(() => getSnellPsk({ anytlsPassword: '' }));
    const config = new SingBoxConfig({ inbounds: [raw] });
    assert.equal(config.getAllInbounds()[0].type, 'snell');
    config.cleanInboundClients();
    config.includeUserBatch([user], new Map());
    assert.deepEqual(config.getConfig().inbounds?.[0].users, [{ name: '18', psk }]);
    config.cleanInboundClients();
    assert.deepEqual(config.getConfig().inbounds?.[0].users, []);
    assert.equal(config.getConfig().inbounds?.[0].multi_user_psk, true);
    const normalized = new SingBoxConfig({
        inbounds: [
            { type: 'snell', tag: 'snell', version: 5, multiUserPsk: true, obfsMode: 'http' },
        ],
    });
    // Real opaque JSON alias input must not already contain its snake-case key.
    assert.equal(normalized.getConfig().inbounds?.[0].obfs_mode, 'http');
    for (const change of [
        { version: 6 },
        { multi_user_psk: false },
        { psk: 'shared' },
        { tls: {} },
        { transport: { type: 'ws' } },
        { obfs_mode: 'tls' },
    ]) {
        assert.throws(() => new SingBoxConfig({ inbounds: [{ ...raw, ...change }] }));
    }
    assert.throws(() =>
        config.includeUserBatch(
            Array.from({ length: 257 }, () => user),
            new Map(),
        ),
    );
    const host = {
        finalRemark: 'snell-test',
        address: '127.0.0.1',
        port: 54320,
        protocol: 'snell',
        protocolOptions: { psk, version: 5, obfs: 'http' },
        security: 'none',
        transport: 'tcp',
        transportOptions: { header: null },
        mux: { smux: { enabled: true } },
        streamOverrides: { finalMask: null, sockopt: null },
        clientOverrides: {
            mapper: {},
            shuffleHost: false,
            mihomoX25519: false,
            mihomoIpVersion: null,
            serverDescription: null,
        },
        metadata: {
            uuid: '00000000-0000-4000-8000-000000000001',
            tags: [],
            excludeFromSubscriptionTypes: [],
            inboundTag: 'snell',
            configProfileUuid: null,
            configProfileInboundUuid: null,
            isDisabled: false,
            isHidden: false,
            viewPosition: 0,
            remark: 'snell-test',
            vlessRouteId: null,
            rawInbound: raw,
        },
    } satisfies ResolvedProxyConfig;
    const parsed = ResolvedProxyConfigSchema.parse(host);
    assert.deepEqual(parsed.protocolOptions, host.protocolOptions);
    const resolver = new ResolveProxyConfigService({
        getOrThrow: () => 'sub.example.com',
    } as never);
    const resolved = await resolver.resolveProxyConfig({
        hosts: [
            new HostWithRawInbound({
                ...host.metadata,
                remark: 'snell',
                rawInbound: { ...raw, obfs_mode: 'http' },
                address: host.address,
                port: host.port,
                mapper: {},
            } as never),
        ],
        user: { ...user, status: 'ACTIVE' } as never,
        subscriptionSettings: new SubscriptionSettingsEntity({ isShowCustomRemarks: false }),
    });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].protocol, 'snell');
    assert.deepEqual(resolved[0].protocolOptions, host.protocolOptions);
    const templates = {
        getCachedTemplateByType: async () => ({
            outbounds: [{ type: 'selector', tag: 'AUTO' }],
            'proxy-groups': [],
            rules: [],
        }),
        getCachedTextTemplateByType: async () =>
            '[Proxy]\n#!remnawave-proxies\n[Proxy Group]\nFinal = select, #!remnawave-proxy-names',
    } as unknown as SubscriptionTemplateService;
    const singbox = JSON.parse(await new SingBoxGeneratorService(templates).generateConfig([host]));
    const outbound = singbox.outbounds.find((item: { type: string }) => item.type === 'snell');
    assert.equal(outbound.psk, psk);
    assert.equal(outbound.version, 4);
    assert.equal(outbound.obfs_mode, 'http');
    assert.equal(outbound.userkey, undefined);
    assert.equal(outbound.multiplex, undefined);
    const mihomo = load(await new MihomoGeneratorService(templates).generateConfig([host])) as {
        proxies: Array<Record<string, unknown>>;
    };
    assert.equal(mihomo.proxies[0].psk, psk);
    assert.equal(mihomo.proxies[0].version, 5);
    assert.equal(mihomo.proxies[0].smux, undefined);
    assert.deepEqual(mihomo.proxies[0]['obfs-opts'], { mode: 'http' });
    const stashGenerator = new MihomoGeneratorService(templates);
    const stash = load(await stashGenerator.generateConfig([host], true)) as {
        proxies: Array<Record<string, unknown>>;
    };
    assert.equal(stash.proxies.length, 1);
    assert.equal(stash.proxies[0].type, 'snell');
    assert.equal(stash.proxies[0].version, 5);
    assert.equal(stash.proxies[0].psk, psk);
    assert.equal(stash.proxies[0].udp, true);
    assert.equal(stash.proxies[0].network, undefined);
    assert.equal(stash.proxies[0].smux, undefined);
    assert.deepEqual(stash.proxies[0]['obfs-opts'], { mode: 'http' });
    const excludedStash = load(
        await stashGenerator.generateConfig(
            [{ ...host, metadata: { ...host.metadata, excludeFromSubscriptionTypes: ['STASH'] } }],
            true,
        ),
    ) as { proxies: unknown[] };
    assert.deepEqual(excludedStash.proxies, []);
    const surge = await new SurgeGeneratorService(templates).generateConfig([host]);
    assert.match(surge, /snell-test = snell, 127\.0\.0\.1, 54320,/);
    assert.ok(surge.includes(`psk=${psk}, version=5, block-quic=on, obfs=http`));
    assert.ok(!surge.includes('version=4'));
    assert.ok(!surge.includes('udp-relay=false'));
    const plainSurge = await new SurgeGeneratorService(templates).generateConfig([
        { ...host, protocolOptions: { ...host.protocolOptions, obfs: 'none' } },
    ]);
    assert.ok(plainSurge.includes(`psk=${psk}, version=5, block-quic=on`));
    assert.ok(!plainSurge.includes('obfs='));
    assert.deepEqual(new Base64GeneratorService().generateLinks([host], false), []);
    process.stdout.write('Snell configuration, credentials and subscription tests passed\n');
}

void main();
