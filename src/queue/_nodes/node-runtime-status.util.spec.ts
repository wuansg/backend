import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveNodeRuntimeStatus, resolveNodeVersions } from './node-runtime-status.util';

const health = {
    isAlive: true,
    nodeVersion: '3.8.0',
    runtimeMode: 'FORWARDING_ONLY' as const,
    runningCore: null,
    coreOnline: false,
    supportedCores: ['SING_BOX' as const],
    capabilities: ['runtime_mode_v1', 'core_sing_box_v1'],
    forwarding: {
        state: 'applied',
        configuredRules: 2,
        enabledRules: 2,
        dnsResults: { edge: '198.51.100.10' },
    },
    usageSnapshot: {
        supported: true,
        active: false,
        enabled: false,
        capturing: false,
    },
    coreVersions: { singBox: '1.14.0' },
};

describe('resolveNodeRuntimeStatus', () => {
    it('preserves the runtime state advertised by the node agent', () => {
        const result = resolveNodeRuntimeStatus(health);

        assert.equal(result.mode, 'FORWARDING_ONLY');
        assert.equal(result.forwarding?.enabledRules, 2);
        assert.deepEqual(result.supportedCores, ['SING_BOX']);
        assert.equal(result.usageSnapshot?.capturing, false);
    });

    it('refreshes sing-box and node versions from every health response', () => {
        assert.deepEqual(resolveNodeVersions(health), {
            singBox: '1.14.0',
            node: '3.8.0',
            core: null,
        });
    });
});
