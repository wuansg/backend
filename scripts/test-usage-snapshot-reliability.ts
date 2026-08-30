import { AxiosError } from 'axios';
import assert from 'node:assert/strict';

import { retryTransient } from '@common/axios/transient-retry';

import { buildNodeMetricsFromSnapshots } from '@queue/_nodes/node-metrics.publisher';
import {
    collectSortedUsageUserIds,
    isRetryableDatabaseTransactionError,
    retryDatabaseTransaction,
} from '@queue/_nodes/usage-snapshot-transaction.util';
import { buildUsageSnapshotWriteBatch } from '@queue/_nodes/usage-snapshot-write-batch.util';

async function main() {
    const nodeUuid = '00000000-0000-0000-0000-000000000001';
    const snapshots = [
        {
            generation: 'generation-1',
            sequence: 1,
            capturedAt: '2026-08-11T15:00:00.000Z',
            core: 'sing-box',
            counters: [
                { kind: 'inbound', name: 'anytls', direction: 'uplink', value: 100 },
                { kind: 'inbound', name: 'anytls', direction: 'downlink', value: 200 },
                { kind: 'outbound', name: 'direct', direction: 'uplink', value: 300 },
                { kind: 'user', name: '42', direction: 'downlink', value: 9_999 },
            ],
        },
        {
            generation: 'generation-1',
            sequence: 2,
            capturedAt: '2026-08-11T15:00:10.000Z',
            core: 'sing-box',
            counters: [
                { kind: 'inbound', name: 'anytls', direction: 'uplink', value: 25 },
                { kind: 'outbound', name: 'direct', direction: 'downlink', value: 400 },
            ],
        },
    ] as const;

    assert.deepEqual(buildNodeMetricsFromSnapshots(nodeUuid, [...snapshots]), {
        nodeUuid,
        inbounds: [{ tag: 'anytls', downlink: '200', uplink: '125' }],
        outbounds: [{ tag: 'direct', downlink: '400', uplink: '300' }],
    });

    assert.equal(
        buildNodeMetricsFromSnapshots(nodeUuid, [
            {
                ...snapshots[0],
                counters: [{ kind: 'inbound', name: 'idle', direction: 'uplink', value: 0 }],
            },
        ]),
        null,
    );

    let attempts = 0;
    const retried = await retryTransient(
        async () => {
            attempts++;
            if (attempts === 1) throw new AxiosError('socket hang up', 'ECONNRESET');
            return 'ok';
        },
        { delayMs: 0 },
    );
    assert.equal(retried, 'ok');
    assert.equal(attempts, 2);

    attempts = 0;
    await assert.rejects(
        retryTransient(
            async () => {
                attempts++;
                throw new AxiosError('bad request', undefined, undefined, undefined, {
                    status: 400,
                } as never);
            },
            { delayMs: 0 },
        ),
    );
    assert.equal(attempts, 1);

    attempts = 0;
    await assert.rejects(
        retryTransient(
            async () => {
                attempts++;
                throw new AxiosError('gateway unavailable', undefined, undefined, undefined, {
                    status: 503,
                } as never);
            },
            { delayMs: 0 },
        ),
    );
    assert.equal(attempts, 2);

    const batch = buildUsageSnapshotWriteBatch(
        [
            {
                ...snapshots[0],
                counters: snapshots[0].counters.map((counter) =>
                    counter.kind === 'user' ? { ...counter, inbound: 'anytls' } : counter,
                ),
            },
            snapshots[1],
        ],
        '1500000000',
        '2000000000',
    );
    assert.deepEqual(batch.nodeHours, [
        {
            hour: new Date('2026-08-11T15:00:00.000Z'),
            usage: { uplink: 300n, downlink: 400n },
        },
    ]);
    assert.equal(batch.nodeMultipliedTotal, 1_400n);
    assert.deepEqual(batch.users, [
        {
            userId: 42n,
            total: 9_999n,
            multipliedTotal: 14_998n,
            firstCapturedAt: new Date('2026-08-11T15:00:00.000Z'),
            lastCapturedAt: new Date('2026-08-11T15:00:00.000Z'),
        },
    ]);
    assert.deepEqual(batch.hosts, [
        {
            tag: 'anytls',
            hour: new Date('2026-08-11T15:00:00.000Z'),
            usage: { uplink: 125n, downlink: 200n },
        },
    ]);
    assert.deepEqual(batch.userHosts, [
        {
            userId: 42n,
            tag: 'anytls',
            hour: new Date('2026-08-11T15:00:00.000Z'),
            usage: { uplink: 0n, downlink: 9_999n },
        },
    ]);

    assert.deepEqual(
        collectSortedUsageUserIds([
            {
                ...snapshots[0],
                counters: [
                    { kind: 'user', name: '100', direction: 'uplink', value: 1 },
                    { kind: 'user', name: '2', direction: 'downlink', value: 1 },
                    { kind: 'user', name: '100', direction: 'downlink', value: 1 },
                    { kind: 'user', name: 'invalid', direction: 'uplink', value: 1 },
                ],
            },
        ]),
        [2n, 100n],
    );

    assert.equal(
        isRetryableDatabaseTransactionError({ code: 'P2010', meta: { code: '40P01' } }),
        true,
    );
    assert.equal(isRetryableDatabaseTransactionError({ code: '23505' }), false);

    attempts = 0;
    const retries: number[] = [];
    const transactionResult = await retryDatabaseTransaction(
        async () => {
            attempts++;
            if (attempts < 3) throw { code: 'P2010', meta: { code: '40P01' } };
            return 'committed';
        },
        {
            delayMs: 0,
            onRetry: (_error, retry) => retries.push(retry),
        },
    );
    assert.equal(transactionResult, 'committed');
    assert.equal(attempts, 3);
    assert.deepEqual(retries, [1, 2]);

    attempts = 0;
    await assert.rejects(
        retryDatabaseTransaction(
            async () => {
                attempts++;
                throw { code: '23505' };
            },
            { delayMs: 0 },
        ),
    );
    assert.equal(attempts, 1);

    process.stdout.write('Usage snapshot reliability regression checks passed.\n');
}

void main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
});
