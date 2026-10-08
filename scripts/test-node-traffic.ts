import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { UsageSnapshot } from '@common/axios';
import {
    getLegacyNodeTrafficPeriodStart,
    getNodeTrafficHistoryStart,
} from '@common/utils/node-traffic-period.util';

import { NodesService } from '@modules/nodes/nodes.service';

import { ResetNodeTrafficTask } from '@scheduler/tasks/reset-node-traffic/reset-node-traffic.service';

import { UsageSnapshotIngestService } from '@queue/_nodes/usage-snapshot-ingest.service';
import { buildUsageSnapshotWriteBatch } from '@queue/_nodes/usage-snapshot-write-batch.util';

const ruleId = '00000000-0000-4000-8000-000000000011';
const snapshot = (sequence: number, capturedAt: Date, core = 0, forwarding = 0): UsageSnapshot => ({
    generation: 'fixture',
    sequence,
    capturedAt: capturedAt.toISOString(),
    core: core ? 'sing-box' : 'FORWARDING_ONLY',
    counters: [
        { kind: 'outbound', name: 'direct', direction: 'downlink', value: core },
        {
            kind: 'forwarding',
            name: ruleId,
            protocol: 'TCP',
            direction: 'uplink',
            value: forwarding,
        },
    ],
});

async function unitTests() {
    const originalTimezone = process.env.TZ;
    try {
        for (const timezone of ['UTC', 'Asia/Shanghai', 'America/Los_Angeles']) {
            process.env.TZ = timezone;
            const node = {
                createdAt: new Date(2025, 0, 1),
                isTrafficTrackingActive: true,
                trafficResetDay: 31,
            };
            assert.equal(
                +getLegacyNodeTrafficPeriodStart(node, new Date(2026, 2, 1, 12)),
                +new Date(2026, 1, 28, 1),
            );
            assert.equal(
                +getLegacyNodeTrafficPeriodStart(node, new Date(2024, 2, 1, 12)),
                +node.createdAt,
            );
            assert.equal(
                +getLegacyNodeTrafficPeriodStart(
                    { ...node, createdAt: new Date(2023, 0, 1) },
                    new Date(2024, 2, 1, 12),
                ),
                +new Date(2024, 1, 29, 1),
            );
            assert.equal(
                +getLegacyNodeTrafficPeriodStart(
                    { ...node, trafficResetDay: 1 },
                    new Date(2026, 0, 1, 0, 59),
                ),
                +new Date(2025, 11, 1, 1),
            );
            assert.equal(
                +getLegacyNodeTrafficPeriodStart({ ...node, isTrafficTrackingActive: false }),
                +node.createdAt,
            );
            const createdAt = new Date(2026, 9, 7, 10, 30);
            assert.equal(
                +getLegacyNodeTrafficPeriodStart(
                    { ...node, createdAt, trafficResetDay: 1 },
                    new Date(2026, 9, 8),
                ),
                +createdAt,
            );
        }
    } finally {
        if (originalTimezone === undefined) delete process.env.TZ;
        else process.env.TZ = originalTimezone;
    }
    assert.equal(
        getNodeTrafficHistoryStart(new Date('2026-10-07T10:30:12Z')).toISOString(),
        '2026-10-07T10:00:00.000Z',
    );

    const capturedAt = new Date('2026-10-08T03:00:00Z');
    const mixed = snapshot(1, capturedAt, 30, 20);
    mixed.counters.push(
        { kind: 'forwarding', name: ruleId, protocol: 'udp', direction: 'downlink', value: 10 },
        { kind: 'forwarding', name: 'invalid', protocol: 'TCP', direction: 'uplink', value: 999 },
        { kind: 'forwarding', name: ruleId, protocol: 'unknown', direction: 'uplink', value: 999 },
        { kind: 'user', name: '42', direction: 'uplink', value: 5 },
        { kind: 'user', name: '42', direction: 'downlink', value: 15 },
        { kind: 'inbound', name: 'anytls', direction: 'uplink', value: 100 },
    );
    const batch = buildUsageSnapshotWriteBatch([mixed], '1500000000', '2000000000', capturedAt);
    assert.equal(
        batch.nodeMultipliedTotal,
        120n,
        'Core + TCP/UDP forwarding, with the node multiplier only',
    );
    assert.equal(
        batch.nodeHours[0].usage.downlink,
        30n,
        'Core history is not polluted by forwarding',
    );
    assert.equal(batch.forwardingRules.length, 2);
    assert.equal(batch.users[0].multipliedTotal, 30n, 'Forwarding does not charge users');
    assert.equal(batch.hosts[0].usage.uplink, 100n, 'Host history remains independent');
    const late = buildUsageSnapshotWriteBatch(
        [mixed],
        '1000000000',
        '1000000000',
        new Date(+capturedAt + 1),
    );
    assert.equal(late.nodeMultipliedTotal, 0n);
    assert.equal(late.forwardingRules.length, 2, 'Late pre-reset usage must still enter history');
    assert.equal(
        buildUsageSnapshotWriteBatch([snapshot(2, capturedAt, 1, 1)], '1000000000', '500000000')
            .nodeMultipliedTotal,
        1n,
        'Round once per combined snapshot',
    );

    let reset: any;
    const nodeUuid = '00000000-0000-4000-8000-000000000001';
    const repository = {
        findByUUID: async () => ({ uuid: nodeUuid }),
        update: async (data: any) => {
            reset = data;
        },
    };
    const service = new NodesService(
        repository as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
    );
    assert.equal((await service.resetNodeTraffic(nodeUuid)).isOk, true);
    assert.equal(reset.trafficUsedBytes, 0n);
    assert.ok(
        reset.trafficUsageStartedAt instanceof Date,
        'Manual reset writes a period boundary atomically',
    );
    const task = new ResetNodeTrafficTask(
        {
            execute: async () => ({
                isOk: true,
                response: [
                    {
                        uuid: nodeUuid,
                        isTrafficTrackingActive: true,
                        trafficResetDay: new Date().getDate(),
                    },
                ],
            }),
        } as any,
        {
            execute: async (command: any) => {
                reset = command.node;
            },
        } as any,
    );
    await task.handleCron();
    assert.equal(reset.trafficUsedBytes, 0n);
    assert.ok(
        reset.trafficUsageStartedAt instanceof Date,
        'Scheduled reset writes a period boundary atomically',
    );
    console.log(
        'Node traffic unit tests passed (core + forwarding, independent scopes, multipliers, reset boundaries/timezones).',
    );
}

async function databaseTests(testUrl: string) {
    const url = new URL(testUrl);
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
    assert.equal(url.pathname, '/remnawave_node_traffic_test');
    assert.equal(url.username, 'node_traffic_test');
    assert.equal(url.searchParams.get('connection_limit'), '2');
    const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
    try {
        const [existing] = await db.$queryRaw<
            Array<{ count: bigint }>
        >`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'`;
        assert.equal(existing.count, 0n, 'Fixture database must be empty; refusing to overwrite');
        await db.$executeRawUnsafe(
            `CREATE TABLE nodes (uuid UUID PRIMARY KEY, created_at TIMESTAMP(3) NOT NULL, is_traffic_tracking_active BOOLEAN NOT NULL, traffic_reset_day INTEGER, traffic_used_bytes BIGINT)`,
        );
        const a = '00000000-0000-4000-8000-000000000001';
        const b = '00000000-0000-4000-8000-000000000002';
        const c = '00000000-0000-4000-8000-000000000003';
        const now = new Date();
        const createdAt = new Date(+now - 40 * 86400_000);
        const periodStart = getLegacyNodeTrafficPeriodStart(
            { createdAt, isTrafficTrackingActive: true, trafficResetDay: 1 },
            now,
        );
        const historyStart = getNodeTrafficHistoryStart(periodStart);
        await db.$executeRaw`INSERT INTO nodes VALUES (${a}::uuid, ${createdAt}, true, 1, 30), (${c}::uuid, ${createdAt}, false, 1, 7)`;
        for (const path of [
            'prisma/migrations/20260811120000_usage_snapshot_inbox/migration.sql',
            'prisma/migrations/20260920120000_add_forwarding_usage_history/migration.sql',
            'prisma/migrations/20261008000000_node_forwarding_traffic_quota/migration.sql',
        ]) {
            for (const statement of readFileSync(path, 'utf8')
                .split(';')
                .filter((value) => value.trim()))
                await db.$executeRawUnsafe(statement);
        }
        await db.$executeRawUnsafe(
            'CREATE TABLE nodes_usage_history (node_uuid UUID, created_at TIMESTAMP(3), upload_bytes BIGINT, download_bytes BIGINT, total_bytes BIGINT, updated_at TIMESTAMP(3) DEFAULT now(), PRIMARY KEY(node_uuid, created_at))',
        );
        await db.$executeRaw`INSERT INTO nodes (uuid,created_at,is_traffic_tracking_active,traffic_reset_day,traffic_used_bytes) VALUES (${b}::uuid, ${now}, true, 1, 0)`;
        const counter = async (uuid: string) => {
            const [row] = await db.$queryRaw<
                Array<{ used: bigint; started: Date | null }>
            >`SELECT traffic_used_bytes AS used, traffic_usage_started_at AS started FROM nodes WHERE uuid=${uuid}::uuid`;
            return row;
        };
        assert.equal(
            (await counter(a)).started,
            null,
            'Migration leaves legacy nodes uninitialized',
        );
        assert.ok(
            (await counter(b)).started instanceof Date,
            'New nodes receive the default boundary',
        );
        await db.$executeRaw`INSERT INTO node_forwarding_usage_history (node_uuid,rule_id,protocol,upload_bytes,total_bytes,created_at) VALUES
            (${a}::uuid,${ruleId}::uuid,'TCP',1000,1000,${new Date(+historyStart - 3600_000)}),
            (${a}::uuid,${ruleId}::uuid,'TCP',60,60,${historyStart}),
            (${c}::uuid,${ruleId}::uuid,'TCP',50,50,${now})`;
        for (const uuid of [a, b, c])
            await db.$executeRaw`INSERT INTO node_usage_snapshot_state (node_uuid,generation) VALUES (${uuid}::uuid,'fixture')`;
        const add = async (uuid: string, payload: UsageSnapshot) => {
            await db.$executeRaw`INSERT INTO node_usage_snapshot_inbox (node_uuid,generation,sequence,captured_at,core,payload) VALUES (${uuid}::uuid,'fixture',${BigInt(payload.sequence)},${new Date(payload.capturedAt)},${payload.core},${JSON.stringify(payload)}::jsonb)`;
        };
        const service = new UsageSnapshotIngestService(
            undefined as any,
            db as any,
            { publish: () => undefined } as any,
        );
        const apply = (uuid: string, multiplier = '1000000000') =>
            (service as any).applyPending(uuid, 1n, '1000000000', multiplier) as Promise<void>;
        await add(a, snapshot(1, new Date(+now + 1000), 30, 20));
        await Promise.all([apply(a), apply(a)]);
        assert.equal(
            (await counter(a)).used,
            140n,
            'One-time current-cycle backfill + mixed traffic, no concurrent double count',
        );
        assert.equal(+(await counter(a)).started!, +periodStart);
        await apply(a);
        await (
            new UsageSnapshotIngestService(
                undefined as any,
                db as any,
                { publish: () => undefined } as any,
            ) as any
        ).applyPending(a, 1n, '1000000000', '1000000000');
        assert.equal(
            (await counter(a)).used,
            140n,
            'Replay/restart does not repeat backfill or usage',
        );

        const resetAt = new Date(+now + 2000);
        await db.$executeRaw`UPDATE nodes SET traffic_used_bytes=0, traffic_usage_started_at=${resetAt} WHERE uuid=${a}::uuid`;
        await add(a, snapshot(2, new Date(+now - 3600_000), 6, 4));
        await add(a, snapshot(3, new Date(+now + 3000), 3, 7));
        await apply(a);
        assert.equal(
            (await counter(a)).used,
            10n,
            'Reset excludes delayed old snapshots without readding backfill',
        );
        const [history] = await db.$queryRaw<
            Array<{ core: bigint; forwarding: bigint }>
        >`SELECT (SELECT SUM(total_bytes)::bigint FROM nodes_usage_history WHERE node_uuid=${a}::uuid) AS core, (SELECT SUM(total_bytes)::bigint FROM node_forwarding_usage_history WHERE node_uuid=${a}::uuid) AS forwarding`;
        assert.equal(history.core, 39n);
        assert.equal(
            history.forwarding,
            1091n,
            'Historical scopes keep pre-reset records separately',
        );

        await add(b, snapshot(1, new Date(+now + 3000), 0, 12));
        await apply(b, '2000000000');
        assert.equal(
            (await counter(b)).used,
            24n,
            'Forwarding-only nodes count traffic with node multiplier',
        );

        await db.$executeRawUnsafe(
            `CREATE FUNCTION fail_fixture_apply() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.sequence=99 THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END $$`,
        );
        await db.$executeRawUnsafe(
            'CREATE TRIGGER fail_fixture BEFORE UPDATE ON node_usage_snapshot_inbox FOR EACH ROW EXECUTE FUNCTION fail_fixture_apply()',
        );
        await add(c, snapshot(99, now, 0, 30));
        await assert.rejects(apply(c), /fixture rollback/);
        assert.equal((await counter(c)).used, 7n);
        assert.equal(
            (await counter(c)).started,
            null,
            'Failed transaction rolls back backfill and boundary',
        );
        const [pending] = await db.$queryRaw<
            Array<{ pending: bigint }>
        >`SELECT COUNT(*) AS pending FROM node_usage_snapshot_inbox WHERE node_uuid=${c}::uuid AND applied_at IS NULL`;
        assert.equal(pending.pending, 1n);
        await db.$executeRawUnsafe('DROP TRIGGER fail_fixture ON node_usage_snapshot_inbox');
        await apply(c);
        assert.equal(
            (await counter(c)).used,
            87n,
            'Retry commits history, backfill and usage exactly once',
        );
        console.log(
            'Node traffic PostgreSQL tests passed (real migrations/ingestion, backfill, concurrency, replay/restart, delayed snapshots, reset, rollback/retry).',
        );
    } finally {
        await db.$disconnect();
    }
}

async function main() {
    await unitTests();
    if (process.env.NODE_TRAFFIC_TEST_DATABASE_URL)
        await databaseTests(process.env.NODE_TRAFFIC_TEST_DATABASE_URL);
    else
        console.log(
            'SQL tests skipped: set NODE_TRAFFIC_TEST_DATABASE_URL to an empty isolated fixture database.',
        );
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
