import type { TNodeRuntimeStatus } from '@contract/models';

import type { NodeAgentHealthResponse } from '@common/axios';

export function resolveNodeRuntimeStatus(
    health: NodeAgentHealthResponse,
    expectsCore: boolean,
): TNodeRuntimeStatus {
    const coreOnline = health.coreOnline ?? health.xrayInternalStatusCached;
    const runningCore = health.runningCore ?? (coreOnline ? 'SING_BOX' : null);
    const supportedCores = (health.supportedCores ?? (runningCore ? [runningCore] : [])).filter(
        (core): core is 'SING_BOX' => core === 'SING_BOX',
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
    const runningCore = health.runningCore ?? (coreOnline ? 'SING_BOX' : null);

    return {
        xray: health.coreVersions?.xray ?? '',
        singBox: health.coreVersions?.singBox ?? null,
        node: health.nodeVersion,
        core: runningCore,
    };
}
