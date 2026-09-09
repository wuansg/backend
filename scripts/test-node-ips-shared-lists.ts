import assert from 'node:assert/strict';

import { GetSharedListCommand } from '@libs/contracts/commands';
import { NodeIpsSchema, SharedListNameSchema } from '@libs/contracts/models';
import { SharedListConfigSchema } from '@libs/node-plugins/models';

import { SharedListEntity } from '@modules/node-plugins/entities/shared-list.entity';
import {
    collectSharedListReferences,
    injectSharedLists,
    validateSharedListReferences,
} from '@modules/node-plugins/utils';

const lists = [
    new SharedListEntity({
        name: 'private_networks',
        config: { type: 'ipList', items: ['10.0.0.0/8', '2001:db8::/32'] },
    }),
    new SharedListEntity({
        name: 'blocked_domains',
        config: { type: 'domainList', items: ['example.com'] },
    }),
    new SharedListEntity({
        name: 'blocked_ports',
        config: { type: 'portList', items: [25, 587] },
    }),
];

const pluginConfig = {
    sharedLists: [{ name: 'ext:untrusted', type: 'ipList', items: ['0.0.0.0/0'] }],
    ingressFilter: { enabled: true, blockedIps: ['ext:private_networks'] },
    egressFilter: {
        enabled: true,
        blockedDomains: ['ext:blocked_domains'],
        blockedPorts: ['ext:blocked_ports'],
    },
};

assert.deepEqual([...collectSharedListReferences(pluginConfig)].sort(), [
    'blocked_domains',
    'blocked_ports',
    'private_networks',
]);
assert.deepEqual(validateSharedListReferences(pluginConfig, lists), []);

const injected = injectSharedLists(pluginConfig, lists);
assert.deepEqual(
    (injected.sharedLists as Array<{ name: string }>).map((list) => list.name).sort(),
    ['ext:blocked_domains', 'ext:blocked_ports', 'ext:private_networks'],
);

assert.match(
    validateSharedListReferences(
        { egressFilter: { enabled: true, blockedPorts: ['ext:blocked_domains'] } },
        lists,
    )[0],
    /requires portList/,
);
assert.match(
    validateSharedListReferences(
        { ingressFilter: { enabled: true, blockedIps: ['ext:missing'] } },
        lists,
    )[0],
    /was not found/,
);

assert.equal(
    SharedListConfigSchema.safeParse({ type: 'domainList', items: ['example.com'] }).success,
    true,
);
assert.equal(
    SharedListConfigSchema.safeParse({ type: 'portList', items: [0, 65_536] }).success,
    false,
);
assert.equal(SharedListNameSchema.safeParse('security/blocked-ips').success, true);
assert.equal(SharedListNameSchema.safeParse('/security').success, false);
assert.equal(SharedListNameSchema.safeParse('security//blocked-ips').success, false);
assert.equal(SharedListNameSchema.safeParse('security/').success, false);
assert.equal(
    GetSharedListCommand.url('security/blocked-ips'),
    '/api/node-plugins/shared-lists/security%2Fblocked-ips',
);
assert.equal(
    GetSharedListCommand.TSQ_url,
    '/api/node-plugins/shared-lists/:name',
    'TSQ placeholder must remain replaceable by the frontend',
);

const nodeIps = Array.from({ length: 64 }, (_, index) => ({
    ip: `192.0.2.${(index % 254) + 1}`,
    status: 'UNKNOWN' as const,
}));
assert.equal(NodeIpsSchema.safeParse(nodeIps).success, true);
assert.equal(NodeIpsSchema.safeParse([...nodeIps, nodeIps[0]]).success, false);

process.stdout.write('Node IP and Shared List checks passed.\n');
