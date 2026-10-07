import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { AxiosService } from '@common/axios';
import { PrismaService } from '@common/database/prisma.service';
import { BenchmarkRequestSchema, BenchmarkTargetSchema } from '@libs/contracts/commands';

import { NodeBenchmarksService } from '../src/modules/node-benchmarks/benchmarks.service';
import { DEFAULT_BENCHMARK_TARGETS } from '../src/modules/node-benchmarks/targets';

const input = { kind: 'HARDWARE', items: ['cpu'] };
assert.equal(BenchmarkRequestSchema.parse(input).threads, 1);
for (const invalid of [
    { ...input, seconds: 60 },
    { ...input, bytesPerDirection: 2 ** 30 },
    { ...input, items: ['download'] },
    { kind: 'NETWORK', items: ['upload'], cities: [] },
    { ...input, sourceIp: 'a', interface: 'eth0' },
])
    assert.equal(BenchmarkRequestSchema.safeParse(invalid).success, false);
assert.equal(DEFAULT_BENCHMARK_TARGETS.length, 12);
for (const target of DEFAULT_BENCHMARK_TARGETS)
    assert.ok(BenchmarkTargetSchema.safeParse(target).success);
assert.equal(
    BenchmarkTargetSchema.safeParse({
        ...DEFAULT_BENCHMARK_TARGETS[0],
        uploadUrl: 'https://user:pass@example.com/test',
    }).success,
    false,
);
async function main() {
    if (!process.env.BENCHMARK_TEST_DATABASE_URL) {
        console.log(
            'Benchmark schema tests passed; set BENCHMARK_TEST_DATABASE_URL for isolated database tests',
        );
        return;
    }
    const url = new URL(process.env.BENCHMARK_TEST_DATABASE_URL);
    assert.ok(
        ['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/benchmark_test',
        'Refusing to run against a non-test database',
    );
    // Use the validated fixture URL explicitly, never the panel DATABASE_URL.
    const db = new PrismaClient({ datasourceUrl: url.toString() }) as PrismaService;
    const nodes: string[] = [];
    const jobs = new Map<string, Record<string, unknown>>();
    const cancelled = new Set<string>();
    const calls = new Map<string, number>();
    const axios = {
        benchmarkRequest: async (path: string, _opts: unknown, data: any) => {
            if (path === 'start') {
                calls.set(data.id, (calls.get(data.id) || 0) + 1);
                if (!jobs.has(data.id))
                    jobs.set(data.id, {
                        id: data.id,
                        status: 'RUNNING',
                        phase: 'cpu',
                        progress: 25,
                        results: [],
                    });
                return { isOk: true, response: jobs.get(data.id) };
            }
            if (path === 'cancel') {
                cancelled.add(data.id);
                jobs.set(data.id, { ...jobs.get(data.id), status: 'CANCELLED', progress: 100 });
                return { isOk: true, response: { cancelled: true } };
            }
            return { isOk: true, response: jobs.get(path) };
        },
    } as unknown as AxiosService;
    const service = new NodeBenchmarksService(db, axios);
    const second = new NodeBenchmarksService(db, axios);
    try {
        await db.$connect();
        for (let i = 0; i < 3; i++) {
            const uuid = randomUUID();
            nodes.push(uuid);
            await db.nodes.create({
                data: {
                    uuid,
                    name: 'benchmark-test-' + uuid,
                    address: 'benchmark-test-' + uuid,
                    isConnected: true,
                    runtimeInventory: {
                        create: {
                            agentVersion: '3.15.0',
                            runtimeMode: 'IDLE',
                            capabilities: ['node_benchmarks_v1'],
                            reportedAt: new Date(),
                        },
                    },
                },
            });
        }
        const created = [];
        for (const uuid of nodes) {
            created.push(await service.create(uuid, input));
            while ((service as any).polling) await new Promise((r) => setTimeout(r, 5));
        }
        assert.equal(await db.nodeBenchmark.count({ where: { status: 'RUNNING' } }), 2);
        assert.equal(await db.nodeBenchmark.count({ where: { status: 'QUEUED' } }), 1);
        await assert.rejects(service.create(nodes[0], input), /active benchmark/);
        await Promise.all([service.tick(), second.tick()]);
        assert.equal(
            await db.nodeBenchmark.count({ where: { status: 'RUNNING' } }),
            2,
            'multi-instance limit',
        );
        await service.cancel(nodes[0], created[0].id);
        await second.tick();
        assert.ok(cancelled.has(created[0].id));
        assert.equal((await service.get(nodes[0], created[0].id)).status, 'CANCELLED');
        await service.tick();
        assert.equal(
            (await service.get(nodes[2], created[2].id)).status,
            'RUNNING',
            'queued job was not promoted',
        );
        jobs.set(created[1].id, {
            id: created[1].id,
            status: 'COMPLETED',
            phase: 'finished',
            progress: 100,
            results: [{ name: 'cpu', status: 'COMPLETED', metrics: { eventsPerSecond: 1234 } }],
        });
        await service.tick();
        assert.equal((await service.get(nodes[1], created[1].id)).status, 'COMPLETED');
        assert.ok(
            (calls.get(created[1].id) || 0) > 1,
            'coordinator must safely retry the same Agent task ID',
        );
        await assert.rejects(
            service.get(nodes[2], created[1].id),
            /not found/,
            'cross-node results leaked',
        );
        // Cancel exactly after the coordinator's status read but before its result
        // update. Polling must not overwrite the newer cancellation with RUNNING.
        const delegate = db.nodeBenchmark.updateMany.bind(db.nodeBenchmark);
        let raced = false;
        db.nodeBenchmark.updateMany = async (args: any) => {
            if (!raced && args.where.id === created[2].id && args.data.result) {
                raced = true;
                await service.cancel(nodes[2], created[2].id);
            }
            return delegate(args);
        };
        await service.tick();
        db.nodeBenchmark.updateMany = delegate;
        assert.ok(raced);
        assert.equal(
            (await service.get(nodes[2], created[2].id)).status,
            'CANCEL_REQUESTED',
            'poll overwrote a concurrent cancel',
        );
        await service.tick();
        assert.equal((await service.get(nodes[2], created[2].id)).status, 'CANCELLED');
        console.log(
            'Benchmark task persistence, concurrency, idempotent polling, cancellation and node isolation passed',
        );
    } finally {
        service.onApplicationShutdown();
        second.onApplicationShutdown();
        await db.nodes.deleteMany({ where: { uuid: { in: nodes } } });
        await db.$disconnect();
    }
}
void main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
