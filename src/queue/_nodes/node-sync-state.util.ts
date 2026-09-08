import type { NodeAgentHealthResponse } from '@common/axios';
import { stableJsonHash } from '@common/utils/stable-json-hash.util';

export interface DesiredNodePlugin {
    uuid: string;
    config: Record<string, unknown>;
    name: string;
}

export function hashNodePluginConfig(config: Record<string, unknown>): string {
    return stableJsonHash(config);
}

export function isNodePluginInSync(
    health: NodeAgentHealthResponse,
    desired: DesiredNodePlugin | null,
): boolean {
    if (!health.capabilities.includes('sync_state_v1') || !health.plugin) return false;

    if (!desired) {
        return health.plugin.activePlugin === null && health.plugin.configHash === '';
    }

    return (
        health.plugin.activePlugin?.uuid === desired.uuid &&
        health.plugin.configHash === hashNodePluginConfig(desired.config)
    );
}
