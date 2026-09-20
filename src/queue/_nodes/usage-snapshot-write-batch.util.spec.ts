import assert from 'node:assert/strict';

import { buildUsageSnapshotWriteBatch } from './usage-snapshot-write-batch.util';

const ruleId = '01989d90-cd3a-7e24-9ab2-a37b39acde11';
const batch = buildUsageSnapshotWriteBatch(
    [
        {
            generation: 'generation-1',
            sequence: 1,
            capturedAt: '2026-09-20T11:12:13.000Z',
            core: 'FORWARDING_ONLY',
            counters: [
                {
                    kind: 'forwarding',
                    name: ruleId,
                    protocol: 'tcp',
                    scope: 'apply-1',
                    direction: 'uplink',
                    value: 120,
                },
                {
                    kind: 'forwarding',
                    name: ruleId,
                    protocol: 'TCP',
                    scope: 'apply-1',
                    direction: 'downlink',
                    value: 80,
                },
                {
                    kind: 'forwarding',
                    name: 'not-a-uuid',
                    protocol: 'UDP',
                    direction: 'uplink',
                    value: 999,
                },
            ],
        },
    ],
    '1000000000',
    '1000000000',
);

assert.deepEqual(batch.forwardingRules, [
    {
        ruleId,
        protocol: 'TCP',
        hour: new Date('2026-09-20T11:00:00.000Z'),
        usage: { uplink: 120n, downlink: 80n },
    },
]);
assert.equal(batch.nodeHours.length, 0);
assert.equal(batch.nodeMultipliedTotal, 0n);

console.log('usage-snapshot forwarding batch: 4 tests passed');
