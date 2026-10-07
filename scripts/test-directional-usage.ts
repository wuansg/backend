import { NestJsPrismaKyselyModule } from '@kastov/nestjs-prisma-kysely';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';

import { OpaqueJsonCamelCasePlugin } from '@common/database/opaque-json-camel-case.plugin';
import { trafficColumn } from '@common/utils/traffic-direction.util';
import {
    GetStatsHostsUsageCommand,
    GetStatsHostUsersUsageCommand,
    GetStatsNodesUsageCommand,
    GetStatsNodeUsersUsageCommand,
    GetStatsNodesUsersUsageCommand,
    GetStatsUserHostsUsageCommand,
    GetStatsUserUsageCommand,
    GetStatsUsersUsageCommand,
} from '@libs/contracts/commands';

import { GetStatsHostsUsageResponseModel } from '@modules/hosts-usage-history/models/get-stats-hosts-usage.response.model';
import { HostsUsageHistoryRepository } from '@modules/hosts-usage-history/repositories/hosts-usage-history.repository';
import { GetStatsNodesUsageResponseModel } from '@modules/nodes-usage-history/models/get-stats-nodes-usage.response.model';
import { NodesUsageHistoryRepository } from '@modules/nodes-usage-history/repositories/nodes-usage-history.repository';
import { NodesUserUsageHistoryRepository } from '@modules/nodes-user-usage-history/repositories/nodes-user-usage-history.repository';

// Never run fixture DDL against a panel database. An explicit loopback-only URL is mandatory.
const testUrl = process.env.USAGE_STATS_TEST_DATABASE_URL;
assert.ok(testUrl, 'Set USAGE_STATS_TEST_DATABASE_URL to an isolated local fixture database');
const parsed = new URL(testUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname));
assert.equal(parsed.pathname, '/remnawave_usage_stats_test');
assert.equal(parsed.username, 'usage_stats_test');
assert.equal(parsed.searchParams.get('connection_limit'), '1');

const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
const host = { tx: db };
// Use exactly the production Prisma/Kysely driver and naming plugin, without booting Nest.
const definition = NestJsPrismaKyselyModule.forRoot({ plugins: [new OpaqueJsonCamelCasePlugin()] });
const kysely = (definition.providers![0] as any).useFactory(host);
const nodes = new NodesUsageHistoryRepository(host as any, { kysely } as any, {} as any);
const users = new NodesUserUsageHistoryRepository(host as any, { kysely } as any, {} as any);
const hosts = new HostsUsageHistoryRepository(host as any, {} as any);
const start = new Date('2026-10-01T00:00:00.000Z');
const end = new Date('2026-10-03T23:59:59.999Z');
const dates = ['2026-10-01', '2026-10-02', '2026-10-03'];
const uuid = (id: number) => `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`;
const numbers = (rows: any[]) => rows.map((row) => Number(row));

async function main() {
    for (const command of [
        GetStatsHostsUsageCommand,
        GetStatsHostUsersUsageCommand,
        GetStatsNodesUsageCommand,
        GetStatsNodeUsersUsageCommand,
        GetStatsNodesUsersUsageCommand,
        GetStatsUserHostsUsageCommand,
        GetStatsUserUsageCommand,
        GetStatsUsersUsageCommand,
    ]) {
        const base = { start: dates[0], end: dates[2] };
        assert.equal(command.RequestQuerySchema.safeParse(base).success, true);
        for (const trafficDirection of ['total', 'upload', 'download']) {
            assert.equal(
                command.RequestQuerySchema.safeParse({ ...base, trafficDirection }).success,
                true,
            );
        }
        assert.equal(
            command.RequestQuerySchema.safeParse({
                ...base,
                trafficDirection: 'upload_bytes; DROP TABLE users',
            }).success,
            false,
        );
    }
    assert.equal(trafficColumn(), 'totalBytes');
    assert.equal(trafficColumn('upload'), 'uploadBytes');
    // This database is throwaway, but the schema must be fresh so accidental reruns are harmless.
    const existing = await db.$queryRaw<
        Array<{ count: bigint }>
    >`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'`;
    assert.equal(
        Number(existing[0].count),
        0,
        'Fixture database is not empty; refusing to overwrite',
    );
    for (const ddl of [
        `CREATE TABLE nodes (id BIGINT PRIMARY KEY, uuid UUID UNIQUE, name TEXT, country_code TEXT)`,
        `CREATE TABLE users (id BIGINT PRIMARY KEY, username TEXT)`,
        `CREATE TABLE hosts (uuid UUID PRIMARY KEY, remark TEXT, address TEXT, port INTEGER, view_position INTEGER, tags TEXT[])`,
        `CREATE TABLE nodes_usage_history (node_uuid UUID, created_at TIMESTAMP(3), upload_bytes BIGINT, download_bytes BIGINT, total_bytes BIGINT)`,
        `CREATE TABLE nodes_user_usage_history (node_id BIGINT, user_id BIGINT, created_at DATE, upload_bytes BIGINT, download_bytes BIGINT, total_bytes BIGINT)`,
        `CREATE TABLE hosts_usage_history (host_uuid UUID, node_uuid UUID, inbound_tag TEXT, created_at TIMESTAMP(3), upload_bytes BIGINT, download_bytes BIGINT, total_bytes BIGINT, is_shared BOOLEAN)`,
        `CREATE TABLE user_hosts_usage_history (user_id BIGINT, host_uuid UUID, node_uuid UUID, inbound_tag TEXT, created_at TIMESTAMP(3), upload_bytes BIGINT, download_bytes BIGINT, total_bytes BIGINT, is_shared BOOLEAN)`,
        `INSERT INTO nodes VALUES (1, '${uuid(1)}', 'upload-heavy', 'SG'), (2, '${uuid(2)}', 'download-heavy', 'HK')`,
        `INSERT INTO users VALUES (1, 'upload-heavy'), (2, 'download-heavy')`,
        `INSERT INTO nodes_usage_history VALUES
            ('${uuid(1)}', '2026-10-01 23:59:59.999', 90, 10, 100),
            ('${uuid(1)}', '2026-10-01 01:00:00', 0, 0, 50),
            ('${uuid(1)}', '2026-10-02 00:00:00', 10, 10, 20),
            ('${uuid(2)}', '2026-10-01 12:00:00', 5, 195, 200)`,
        `INSERT INTO nodes_user_usage_history VALUES (1, 1, '2026-10-01', 90, 10, 150), (1, 2, '2026-10-01', 5, 195, 200), (2, 1, '2026-10-02', 10, 10, 20)`,
        `INSERT INTO nodes_user_usage_history VALUES (2, 2, '2026-09-30', 999999, 0, 999999), (2, 2, '2026-10-04', 999999, 0, 999999)`,
        `INSERT INTO nodes_usage_history VALUES ('${uuid(2)}', '2026-09-30 23:59:59.999', 999999, 0, 999999), ('${uuid(2)}', '2026-10-04 00:00:00', 999999, 0, 999999)`,
        `INSERT INTO hosts VALUES ('${uuid(11)}', 'alias-a', 'a.example', 443, 1, ARRAY['a']), ('${uuid(12)}', 'alias-b', 'b.example', 443, 2, ARRAY['a']), ('${uuid(13)}', 'download', 'd.example', 443, 3, ARRAY['b'])`,
        `INSERT INTO hosts_usage_history VALUES
            ('${uuid(11)}', '${uuid(1)}', 'shared', '2026-10-01 23:00:00', 90, 10, 150, TRUE),
            ('${uuid(12)}', '${uuid(1)}', 'shared', '2026-10-01 23:00:00', 90, 10, 150, TRUE),
            ('${uuid(11)}', '${uuid(1)}', 'shared', '2026-10-02 00:00:00', 10, 10, 20, TRUE),
            ('${uuid(12)}', '${uuid(1)}', 'shared', '2026-10-02 00:00:00', 10, 10, 20, TRUE),
            ('${uuid(13)}', '${uuid(2)}', 'other', '2026-10-01 12:00:00', 5, 195, 200, FALSE)`,
        `INSERT INTO hosts_usage_history VALUES ('${uuid(13)}', '${uuid(2)}', 'other', '2026-09-30 23:59:59.999', 999999, 0, 999999, FALSE), ('${uuid(13)}', '${uuid(2)}', 'other', '2026-10-04 00:00:00', 999999, 0, 999999, FALSE)`,
        `INSERT INTO user_hosts_usage_history SELECT CASE WHEN inbound_tag = 'shared' THEN 1 ELSE 2 END, host_uuid, node_uuid, inbound_tag, created_at, upload_bytes, download_bytes, total_bytes, is_shared FROM hosts_usage_history`,
    ])
        await db.$executeRawUnsafe(ddl);

    for (const timezone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
        // Prisma pool size must be 1 (see runner); set the timezone on that one connection.
        await db.$executeRawUnsafe(`SET TIME ZONE '${timezone}'`);
        const expected = { total: [350, 20, 0], upload: [95, 10, 0], download: [205, 10, 0] };
        assert.deepEqual(await nodes.getDirectionalDailyTrafficSum(start, end, dates), expected);
        assert.deepEqual(await hosts.getDirectionalDailyTrafficSum(start, end, dates), expected);
        assert.deepEqual(await users.getUsersDailyTrafficSum(start, end, dates), expected);
        assert.deepEqual(await users.getNodesDailyTrafficSum([], start, end, dates), {
            total: [0, 0, 0],
            upload: [0, 0, 0],
            download: [0, 0, 0],
        });
        for (const direction of ['total', 'upload', 'download'] as const) {
            const winner = direction === 'upload' ? 1 : 2;
            assert.equal(
                (await nodes.getTopNodesByTraffic(start, end, 1, direction))[0].uuid,
                uuid(winner),
            );
            assert.equal(
                Number((await users.getTopUsersByTraffic(start, end, 1, direction))[0].userId),
                winner,
            );
            assert.equal(
                Number(
                    (await users.getTopNodeUsersByTraffic(1n, start, end, 1, direction))[0].userId,
                ),
                winner,
            );
            assert.equal(
                Number(
                    (await users.getTopNodesUsersByTraffic([1n, 2n], start, end, 1, direction))[0]
                        .userId,
                ),
                winner,
            );
            assert.equal(
                Number((await users.getUsersUsageByRange(start, end, dates, 1, direction))[0].id),
                winner,
            );
            assert.equal(
                (await hosts.getTopHostsByTraffic(start, end, 1, direction))[0].nodeUuid,
                uuid(winner),
            );
            const nodeSeries = await nodes.getNodesUsageByRange(start, end, dates, direction);
            assert.equal(nodeSeries[0].uuid, uuid(winner));
            const hostSeries = await hosts.getHostsUsageByRange(start, end, dates, direction);
            assert.equal(hostSeries[0].nodeUuid, uuid(winner));
            const shared = hostSeries.find((row) => row.nodeUuid === uuid(1))!;
            assert.equal(Number(shared.total), 170);
            assert.deepEqual(numbers(shared.uploadData), [90, 10, 0]);
            assert.deepEqual(numbers(shared.downloadData), [10, 10, 0]);
            assert.equal(shared.hosts.length, 2);
            const modelData = {
                categories: dates,
                sparklineData: expected.total,
                uploadSparklineData: expected.upload,
                downloadSparklineData: expected.download,
            };
            GetStatsNodesUsageCommand.ResponseSchema.parse({
                response: new GetStatsNodesUsageResponseModel({
                    ...modelData,
                    series: nodeSeries,
                    topNodes: await nodes.getTopNodesByTraffic(start, end, 1, direction),
                }),
            });
            GetStatsHostsUsageCommand.ResponseSchema.parse({
                response: new GetStatsHostsUsageResponseModel({
                    ...modelData,
                    series: hostSeries,
                    topHosts: await hosts.getTopHostsByTraffic(start, end, 1, direction),
                }),
            });
            assert.equal(
                (await hosts.getTopUserHostsByTraffic(1n, start, end, 1, direction))[0].nodeUuid,
                uuid(1),
            );
        }
        const userHosts = await hosts.getUserHostsUsageByRange(1n, start, end, dates, 'upload');
        assert.equal(userHosts.length, 1);
        assert.equal(Number(userHosts[0].upload), 100);
        assert.deepEqual(await hosts.getDailyUserHostsTrafficSum(1n, start, end, dates), {
            total: [150, 20, 0],
            upload: [90, 10, 0],
            download: [10, 10, 0],
        });
        assert.deepEqual(await hosts.getHostsUsageByRangeForHostUuids([], start, end, dates), []);
        console.log(
            `PASS directional usage / server-side Top N / shared Host dedup / zero-fill (${timezone})`,
        );
    }
}

main()
    .finally(async () => {
        await kysely.destroy();
        await db.$disconnect();
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
