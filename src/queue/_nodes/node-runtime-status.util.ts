import type { TNodeRuntimeStatus } from '@contract/models';

import type { NodeAgentHealthResponse } from '@common/axios';

export function resolveNodeRuntimeStatus(
    health: NodeAgentHealthResponse,
    expectsCore: boolean,
): TNodeRuntimeStatus {
    const coreOnline = health.coreOnline ?? health.xrayInternalStatusCached;
    const runningCore = health.runningCore ?? (coreOnline ? 'XRAY' : null);
    const supportedCores = (health.supportedCores ?? (runningCore ? [runningCore] : [])).filter(
        (core): core is 'XRAY' | 'SING_BOX' => core === 'XRAY' || core === 'SING_BOX',
    );
    const mode =
        health.runtimeMode ?? (coreOnline ? 'CORE_ACTIVE' : expectsCore ? 'DEGRADED' : 'IDLE');

    return {
        mode,
        runningCore,
        coreOnline,
        capabilities: health.capabilities ?? [],
        supportedCores,
        forwarding: health.forwarding ?? null,
        usageSnapshot: health.usageSnapshot ?? null,
    };
}

export function resolveNodeVersions(health: NodeAgentHealthResponse) {
    const coreOnline = health.coreOnline ?? health.xrayInternalStatusCached;
    const runningCore = health.runningCore ?? (coreOnline ? 'XRAY' : null);

    return {
        xray: health.coreVersions?.xray ?? health.xrayVersion,
        singBox: health.coreVersions?.singBox ?? null,
        node: health.nodeVersion,
        core: runningCore,
    };
}
