import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { Reflector } from '@nestjs/core';

import { PrismaService } from '@common/database/prisma.service';
import { ScopesGuard } from '@common/guards/scopes';
import { ForwardingTopologySchema, GetForwardingTopologyCommand } from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import { ForwardingTopologyService } from '@modules/nodes/forwarding/forwarding-topology.service';
import {
    addTopologyUsage,
    buildForwardingTopology,
    emptyTopologyUsage,
    normalizeTopologyAddress,
    TopologyHostInput,
    TopologyNodeInput,
    topologyTransport,
} from '@modules/nodes/forwarding/forwarding-topology.util';
import { NodesController } from '@modules/nodes/nodes.controller';

import { hashNodeForwardingConfig } from '@queue/_nodes/forwarding-sync.util';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = new Date('2026-10-17T10:00:00.000Z');
const inbound = { uuid: id(30), tag: 'AnyTLS', type: 'anytls', port: 443, network: null };
const rule = (n: number, listenPort: number, targetAddress: string, targetPort: number) => ({
    id: id(n),
    name: `forward-${n}`,
    enabled: true,
    protocol: 'TCP_UDP' as const,
    listenPort,
    targetAddress,
    targetPort,
});
function node(
    n: number,
    address: string,
    rules: ReturnType<typeof rule>[],
    ip?: string,
): TopologyNodeInput {
    const config = { enabled: rules.length > 0, listenInterface: 'auto', rules };
    return {
        uuid: id(n),
        name: `fixture-node-${n}`,
        address,
        countryCode: 'SG',
        provider: { name: 'Fixture provider' },
        isConnected: true,
        isDisabled: false,
        forwardingConfig: config,
        isTrafficTrackingActive: true,
        trafficUsedBytes: 123456n,
        trafficLimitBytes: 200n * 1024n ** 3n,
        trafficResetDay: 24,
        runtimeInventory: {
            reportedAt: now,
            runtimeStatus: {
                mode: rules.length ? 'FORWARDING_ONLY' : 'CORE_ACTIVE',
                coreOnline: !rules.length,
                forwarding: {
                    state: 'applied',
                    configHash: hashNodeForwardingConfig(config),
                    dnsResults: { [id(12)]: '203.0.113.3' },
                    dnsStale: false,
                    dnsLastResolvedAt: now.toISOString(),
                },
            },
        },
        networkInventory: {
            reportedAt: now,
            interfaces: ip ? [{ addresses: [{ address: ip, prefix: 24, family: 'IPv4' }] }] : [],
        },
        configState: { requestedSeq: 1n, processedSeq: 1n, blocked: false },
        usageSnapshotState: {
            lastSuccessAt: now,
            pending: 0,
            receivedThrough: 10n,
            appliedThrough: 10n,
            lastError: null,
        },
        configProfileInboundsToNodes: rules.length ? [] : [{ configProfileInbounds: inbound }],
        geocheckHistory: rules.length
            ? []
            : [
                  {
                      snapshot: { exitIp: '192.0.2.99', asn: 'AS64500', country: 'SG' },
                      createdAt: now,
                      sourceType: 'DEFAULT',
                  },
              ],
    };
}
const nodes = [
    node(1, '198.51.100.1', [rule(11, 54320, 'relay.example', 1234)]),
    node(2, 'relay.example', [rule(12, 1234, 'egress-alias.example', 443)]),
    node(3, 'core.example', [], '203.0.113.3'),
];
const host: TopologyHostInput = {
    uuid: id(40),
    remark: 'Fixture Host',
    address: '198.51.100.1',
    port: 54320,
    isDisabled: false,
    configProfileInboundUuid: inbound.uuid,
    configProfileInbounds: inbound,
    nodes: [{ nodeUuid: id(3) }],
};
const fixtureInput = () => ({
    nodes: structuredClone(nodes),
    hosts: [
        structuredClone(host),
        {
            ...structuredClone(host),
            uuid: id(41),
            remark: 'Unknown CDN alias',
            address: 'cdn.example',
        },
    ],
    forwardingUsage: [
        {
            nodeUuid: id(1),
            ruleId: id(11),
            protocol: 'TCP',
            upload: '9007199254740993',
            download: '100',
            total: '9007199254741093',
            lastRecordedAt: now,
        },
        {
            nodeUuid: id(1),
            ruleId: id(11),
            protocol: 'UDP',
            upload: '2',
            download: '3',
            total: '5',
            lastRecordedAt: now,
        },
        {
            nodeUuid: id(1),
            ruleId: id(99),
            protocol: 'TCP',
            upload: '1',
            download: '1',
            total: '2',
            lastRecordedAt: now,
        },
    ],
    coreUsage: [
        { nodeUuid: id(3), upload: '123', download: '456', total: '579', lastRecordedAt: now },
    ],
    hostUsage: [
        {
            nodeUuid: '',
            hostUuid: id(40),
            upload: '123',
            download: '456',
            total: '579',
            lastRecordedAt: now,
            shared: true,
        },
    ],
    start: '2026-10-17',
    end: '2026-10-17',
    now,
});

async function main() {
    const view = ForwardingTopologySchema.parse(buildForwardingTopology(fixtureInput()));
    assert.deepEqual(view.hosts[0].entryNodeUuids, [id(1)]);
    assert.deepEqual(view.rules[0].targetNodeUuids, [id(2)]);
    assert.deepEqual(view.rules[1].targetNodeUuids, [id(3)]);
    assert.equal(view.rules[1].targetMatch, 'DNS');
    assert.equal(view.rules[0].usage.upload, '9007199254740995');
    assert.equal(view.rules[0].usage.total, '9007199254741098');
    assert.equal(view.rules[0].protocols.length, 2);
    assert.equal(view.orphanUsage[0].ruleId, id(99));
    assert.equal(view.hosts[0].usage.shared, true);
    assert.equal(
        view.hosts[1].entryMatch,
        'NONE',
        'Never substitute a Host binding for an observed entry',
    );
    assert.equal(view.nodes[2].coreUsage.total, '579', 'Core and forwarding are independent');
    assert.equal(
        view.nodes[0].quota.used,
        '123456',
        'Do not replace provider-cycle quota with range traffic',
    );
    assert.equal(normalizeTopologyAddress('[2001:0db8:0:0::1]'), '2001:db8::1');
    assert.equal(normalizeTopologyAddress('fe80::1%eth0'), '');
    assert.equal(normalizeTopologyAddress('RELAY.EXAMPLE.'), 'relay.example');
    assert.equal(normalizeTopologyAddress('https://not-an-address.example/path'), '');
    assert.equal(topologyTransport({ ...inbound, type: 'hysteria2' }), 'UDP');
    assert.equal(
        topologyTransport({ ...inbound, type: 'snell' }),
        'UNKNOWN',
        'Do not guess Snell QUIC options',
    );
    assert.equal(
        addTopologyUsage(emptyTopologyUsage(), view.rules[0].usage).total,
        view.rules[0].usage.total,
    );
    let changed = fixtureInput();
    changed.nodes[1].runtimeInventory!.reportedAt = new Date(now.getTime() - 180000);
    assert.equal(buildForwardingTopology(changed).rules[1].resolution, 'STALE');
    changed = fixtureInput();
    (changed.nodes[1].forwardingConfig as any).rules[0].targetAddress = 'changed-target.example';
    const drift = buildForwardingTopology(changed).rules[1];
    assert.equal(
        drift.resolvedTargetAddress,
        null,
        'Do not reuse old DNS after a desired-rule change',
    );
    assert.equal(drift.state, 'PENDING');
    changed = fixtureInput();
    changed.nodes[2].address = 'relay.example';
    assert.equal(buildForwardingTopology(changed).rules[0].targetMatch, 'AMBIGUOUS');
    changed = fixtureInput();
    changed.nodes[0].forwardingConfig = { bad: 'config' };
    const invalid = buildForwardingTopology(changed);
    assert.equal(invalid.nodes[0].configValid, false);
    assert.equal(invalid.orphanUsage.length, 2);
    changed = fixtureInput();
    changed.nodes[0].isConnected = false;
    assert.equal(buildForwardingTopology(changed).rules[0].state, 'OFFLINE');
    changed = fixtureInput();
    changed.nodes[0].isDisabled = true;
    assert.equal(buildForwardingTopology(changed).rules[0].state, 'DISABLED');
    for (const bad of [
        { start: '2026-02-30' },
        { start: '2026-10-18', end: '2026-10-17' },
        { start: '2025-01-01', end: '2026-10-17' },
    ])
        assert.equal(GetForwardingTopologyCommand.RequestQuerySchema.safeParse(bad).success, false);
    assert.equal(GetForwardingTopologyCommand.url, '/api/nodes/forwarding/topology');
    assert.equal(GetForwardingTopologyCommand.endpointDetails.REQUEST_METHOD, 'get');
    const allowed = (scopes: string[], role: string = ROLE.API) =>
        new ScopesGuard(new Reflector()).canActivate({
            getHandler: () => NodesController.prototype.getForwardingTopology,
            getClass: () => NodesController,
            switchToHttp: () => ({ getRequest: () => ({ user: { uuid: id(1), role, scopes } }) }),
        } as any);
    assert.equal(allowed(['users:read']), false);
    assert.equal(allowed(['nodes:get-nodes']), false);
    assert.equal(allowed(['nodes:get-forwarding-topology']), true);
    assert.equal(allowed([], ROLE.ADMIN), true);
    for (const forbidden of [
        'privKey',
        'clientKey',
        'proxyUrl',
        'rawInbound',
        'password',
        'forwardingConfig',
    ])
        assert.equal(
            JSON.stringify(view).includes(`"${forbidden}"`),
            false,
            'Do not expose raw configuration/secrets',
        );
    if (process.argv.includes('--export-fixture')) {
        process.stdout.write(JSON.stringify(view, null, 2));
        return;
    }
    console.log(
        'PASS topology address/DNS/IPv6/ambiguity, stale/hash drift, raw BigInt usage, shared Hosts, deleted rules, query validation and read scopes',
    );
    if (process.env.TOPOLOGY_TEST_DATABASE_URL) await database();
}

async function database() {
    const url = new URL(process.env.TOPOLOGY_TEST_DATABASE_URL!);
    assert(
        ['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/audit_test',
        'Refusing non-fixture database',
    );
    url.searchParams.set('connection_limit', '1');
    const db = new PrismaClient({ datasourceUrl: url.toString() });
    const nodeUuid = randomUUID(),
        hostUuid = randomUUID(),
        ruleId = randomUUID();
    try {
        await db.nodes.create({
            data: {
                uuid: nodeUuid,
                name: 'topology-fixture-' + nodeUuid,
                address: nodeUuid + '.invalid',
                forwardingConfig: {
                    enabled: true,
                    listenInterface: 'auto',
                    rules: [{ ...rule(11, 54320, '192.0.2.5', 443), id: ruleId }],
                },
            },
        });
        await db.hosts.create({
            data: { uuid: hostUuid, remark: 'topology-fixture', address: '192.0.2.1', port: 443 },
        });
        for (const [at, bytes] of [
            ['2026-10-16 23:00:00', 900],
            ['2026-10-17 00:00:00', 10],
            ['2026-10-17 23:00:00', 20],
            ['2026-10-18 00:00:00', 900],
        ] as const) {
            await db.$executeRaw`INSERT INTO node_forwarding_usage_history (node_uuid,rule_id,protocol,upload_bytes,download_bytes,total_bytes,created_at)
                VALUES (${nodeUuid}::uuid,${ruleId}::uuid,'TCP',${bytes},${bytes},${bytes * 2},${at}::timestamp AT TIME ZONE 'UTC')`;
            await db.$executeRaw`INSERT INTO nodes_usage_history (node_uuid,upload_bytes,download_bytes,total_bytes,created_at)
                VALUES (${nodeUuid}::uuid,${bytes},${bytes},${bytes * 2},${at}::timestamp)`;
            await db.$executeRaw`INSERT INTO hosts_usage_history (host_uuid,node_uuid,inbound_tag,upload_bytes,download_bytes,total_bytes,is_shared,created_at)
                VALUES (${hostUuid}::uuid,${nodeUuid}::uuid,'fixture',${bytes},${bytes},${bytes * 2},TRUE,${at}::timestamp)`;
        }
        const service = new ForwardingTopologyService(db as unknown as PrismaService);
        for (const zone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
            await db.$executeRawUnsafe(`SET TIME ZONE '${zone}'`);
            const response = ForwardingTopologySchema.parse(
                await service.get({ start: '2026-10-17', end: '2026-10-17' }),
            );
            assert.equal(response.rules.find((r) => r.id === ruleId)?.usage.total, '60');
            assert.equal(response.nodes.find((n) => n.uuid === nodeUuid)?.coreUsage.total, '60');
            assert.equal(response.hosts.find((h) => h.uuid === hostUuid)?.usage.total, '60');
            assert.equal(response.hosts.find((h) => h.uuid === hostUuid)?.usage.shared, true);
        }
        const config = await db.nodes.findUniqueOrThrow({ where: { uuid: nodeUuid } });
        await db.nodes.update({
            where: { uuid: nodeUuid },
            data: { forwardingConfig: { enabled: false, listenInterface: 'auto', rules: [] } },
        });
        const deleted = await service.get({ start: '2026-10-17', end: '2026-10-17' });
        assert.equal(deleted.orphanUsage.find((r) => r.ruleId === ruleId)?.usage.total, '60');
        assert.equal(
            (await db.nodes.findUniqueOrThrow({ where: { uuid: nodeUuid } })).trafficUsedBytes,
            config.trafficUsedBytes,
            'Topology reads do not mutate quota',
        );
        console.log(
            'PASS real PostgreSQL topology aggregation across three timezones, midnight boundaries, shared Hosts, orphan rules and unchanged quota',
        );
    } finally {
        await db.hosts.deleteMany({ where: { uuid: hostUuid } });
        await db.nodes.deleteMany({ where: { uuid: nodeUuid } });
        await db.$disconnect();
    }
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
