import { NodeForwardingConfigSchema, NodeForwardingIPv4Schema } from '@contract/models';

import { AxiosService } from '@common/axios';
import { stableJsonHash } from '@common/utils/stable-json-hash.util';

import { NodesEntity } from '@modules/nodes/entities';

export async function syncForwardingIfSupported(
    axios: AxiosService,
    node: NodesEntity,
    health: unknown,
    force = false,
): Promise<string | null> {
    const capabilities = (health as { capabilities?: string[] }).capabilities;
    if (!capabilities?.includes('port_forwarding_v1')) return null;

    const parsed = NodeForwardingConfigSchema.safeParse(node.forwardingConfig);
    if (!parsed.success) return 'Stored forwarding configuration is invalid';

    const runtime = health as { forwarding?: { configHash?: string | null } };
    if (!force && runtime.forwarding?.configHash === hashNodeForwardingConfig(parsed.data)) {
        return null;
    }

    const requiresDNS = parsed.data.rules.some(
        (rule) => !NodeForwardingIPv4Schema.safeParse(rule.targetAddress).success,
    );
    if (requiresDNS && !capabilities.includes('port_forwarding_dns_v1')) {
        return 'Hostname forwarding requires Remnawave Node >= 3.3.0';
    }

    const response = await axios.syncNodeForwarding(parsed.data, {
        address: node.address,
        port: node.port,
        proxyUrl: node.proxyUrl,
    });
    return response.isOk ? null : response.message;
}

export function hashNodeForwardingConfig(config: unknown): string {
    return stableJsonHash(config);
}
