import assert from 'node:assert/strict';

import { NodeIpsSchema } from '@libs/contracts/models';
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

const nodeIps = Array.from({ length: 64 }, (_, index) => ({
    ip: `192.0.2.${(index % 254) + 1}`,
    status: 'UNKNOWN' as const,
}));
assert.equal(NodeIpsSchema.safeParse(nodeIps).success, true);
assert.equal(NodeIpsSchema.safeParse([...nodeIps, nodeIps[0]]).success, false);

console.log('Node IP and Shared List checks passed.');
