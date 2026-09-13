import assert from 'node:assert/strict';

import {
    BulkUpdateManagementTagsCommand,
    GetNodeObservabilityCommand,
    ManagementTagsSchema,
    PreviewNodePluginCommand,
    SearchManagementCatalogCommand,
    UpdateNodeGeocheckCommand,
} from '@libs/contracts/commands';

import {
    diffGeocheckSnapshots,
    extractGeocheckSnapshot,
} from '@modules/node-observability/node-observability.repository';

const snapshot = extractGeocheckSnapshot({
    network: { public_ip: '203.0.113.7', as_number: 64500 },
    geo: { country_code: 'SG' },
    connection: { connection_type: 'hosting' },
});
assert.deepEqual(snapshot, {
    exitIp: '203.0.113.7',
    asn: '64500',
    country: 'SG',
    networkType: 'hosting',
});
assert.deepEqual(
    diffGeocheckSnapshots(
        { exitIp: '198.51.100.4', asn: '64500', country: 'SG', networkType: 'hosting' },
        snapshot,
    ),
    [
        {
            kind: 'exitIp',
            previousValue: '198.51.100.4',
            currentValue: '203.0.113.7',
        },
    ],
);
assert.deepEqual(diffGeocheckSnapshots(null, snapshot), []);

assert.equal(PreviewNodePluginCommand.url, '/api/node-plugins/actions/preview');
assert.equal(
    GetNodeObservabilityCommand.url('00000000-0000-4000-8000-000000000000'),
    '/api/nodes/00000000-0000-4000-8000-000000000000/observability',
);

assert.deepEqual(ManagementTagsSchema.parse(['prod', 'prod', 'edge:sg']), ['edge:sg', 'prod']);
assert.equal(ManagementTagsSchema.safeParse(['contains a space']).success, false);
assert.equal(
    ManagementTagsSchema.safeParse(Array.from({ length: 21 }, (_, i) => `tag-${i}`)).success,
    false,
);
assert.equal(SearchManagementCatalogCommand.RequestQuerySchema.parse({ limit: '50' }).limit, 50);
assert.equal(
    SearchManagementCatalogCommand.RequestQuerySchema.safeParse({ limit: 51 }).success,
    false,
);
assert.equal(
    BulkUpdateManagementTagsCommand.RequestBodySchema.safeParse({
        uuids: Array.from({ length: 101 }, () => '00000000-0000-4000-8000-000000000000'),
        tags: ['prod'],
        mode: 'ADD',
    }).success,
    false,
);

assert.equal(
    UpdateNodeGeocheckCommand.RequestBodySchema.safeParse({
        intervalMinutes: 4,
        cooldownMinutes: 60,
        source: { type: 'DEFAULT' },
    }).success,
    false,
);
assert.equal(
    UpdateNodeGeocheckCommand.RequestBodySchema.safeParse({
        intervalMinutes: 60,
        cooldownMinutes: 5,
        source: { type: 'INTERFACE', value: 'eth0' },
    }).success,
    true,
);
assert.equal(
    UpdateNodeGeocheckCommand.RequestBodySchema.safeParse({
        intervalMinutes: null,
        cooldownMinutes: 60,
        source: null,
    }).success,
    true,
);

process.stdout.write('Stages 13-15 contract and observability checks passed.\n');
