import { AxiosError } from 'axios';
import assert from 'node:assert/strict';

import { retryTransient } from '@common/axios/transient-retry';

import { buildNodeMetricsFromSnapshots } from '@queue/_nodes/node-metrics.publisher';

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

    process.stdout.write('Usage snapshot reliability regression checks passed.\n');
}

void main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
});
