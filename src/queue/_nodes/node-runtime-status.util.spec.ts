import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveNodeRuntimeStatus } from './node-runtime-status.util';

describe('resolveNodeRuntimeStatus', () => {
    it('preserves the runtime mode advertised by a new node agent', () => {
        const result = resolveNodeRuntimeStatus(
            {
                isAlive: true,
                xrayInternalStatusCached: false,
                xrayVersion: '26.3.27',
                nodeVersion: '3.4.0',
                runtimeMode: 'FORWARDING_ONLY',
                runningCore: null,
                coreOnline: false,
                supportedCores: ['SING_BOX'],
                capabilities: ['runtime_mode_v1', 'core_sing_box_v1'],
                forwarding: {
                    state: 'applied',
                    configuredRules: 2,
                    enabledRules: 2,
                    dnsResults: { edge: '198.51.100.10' },
                },
            },
            false,
        );

        assert.equal(result.mode, 'FORWARDING_ONLY');
        assert.equal(result.forwarding?.enabledRules, 2);
        assert.deepEqual(result.supportedCores, ['SING_BOX']);
    });

    it('derives a compatible state for an older agent', () => {
        const active = resolveNodeRuntimeStatus(
            {
                isAlive: true,
                xrayInternalStatusCached: true,
                xrayVersion: '26.3.27',
                nodeVersion: '2.7.0',
            },
            true,
        );
        assert.deepEqual(
            { mode: active.mode, runningCore: active.runningCore, coreOnline: active.coreOnline },
            { mode: 'CORE_ACTIVE', runningCore: 'XRAY', coreOnline: true },
        );

        assert.equal(
            resolveNodeRuntimeStatus(
                {
                    isAlive: true,
                    xrayInternalStatusCached: false,
                    xrayVersion: '26.3.27',
                    nodeVersion: '2.7.0',
                },
                true,
            ).mode,
            'DEGRADED',
        );
    });
});
