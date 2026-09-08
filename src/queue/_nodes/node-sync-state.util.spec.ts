import assert from 'node:assert/strict';

import type { NodeAgentHealthResponse } from '@common/axios';

import { hashNodePluginConfig, isNodePluginInSync } from './node-sync-state.util';

const left = { z: [3, { b: true, a: 'x' }], a: 1 };
const right = { a: 1, z: [3, { a: 'x', b: true }] };
assert.equal(hashNodePluginConfig(left), hashNodePluginConfig(right));

const health = {
    capabilities: ['sync_state_v1'],
    plugin: {
        activePlugin: { uuid: 'plugin-1', name: 'Test' },
        configHash: hashNodePluginConfig(left),
    },
} as NodeAgentHealthResponse;
assert.equal(
    isNodePluginInSync(health, { uuid: 'plugin-1', name: 'Renamed', config: right }),
    true,
);
assert.equal(isNodePluginInSync(health, null), false);
assert.equal(isNodePluginInSync({ ...health, capabilities: [] }, null), false);
