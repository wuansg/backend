import type { TNodeRuntimeStatus } from '@contract/models';

import type { NodeAgentHealthResponse } from '@common/axios';

export const MINIMUM_SING_BOX_AGENT_VERSION = '3.8.0';

export function resolveNodeRuntimeStatus(health: NodeAgentHealthResponse): TNodeRuntimeStatus {
    const coreOnline = health.coreOnline;
    const runningCore = health.runningCore;
    const supportedCores = health.supportedCores.filter(
        (core): core is 'SING_BOX' => core === 'SING_BOX',
    );
    return {
        mode: health.runtimeMode,
        runningCore,
        coreOnline,
        capabilities: health.capabilities,
        supportedCores,
        forwarding: health.forwarding,
        usageSnapshot: health.usageSnapshot,
    };
}

export function resolveNodeVersions(health: NodeAgentHealthResponse) {
    const runningCore = health.runningCore;

    return {
        singBox: health.coreVersions?.singBox ?? null,
        node: health.nodeVersion,
        core: runningCore,
    };
}
