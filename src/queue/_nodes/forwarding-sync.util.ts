import { NodeForwardingConfigSchema } from '@contract/models';

import { AxiosService } from '@common/axios';

import { NodesEntity } from '@modules/nodes/entities';

export async function syncForwardingIfSupported(
    axios: AxiosService,
    node: NodesEntity,
    health: unknown,
): Promise<string | null> {
    const capabilities = (health as { capabilities?: string[] }).capabilities;
    if (!capabilities?.includes('port_forwarding_v1')) return null;

    const parsed = NodeForwardingConfigSchema.safeParse(node.forwardingConfig);
    if (!parsed.success) return 'Stored forwarding configuration is invalid';

    const response = await axios.syncNodeForwarding(parsed.data, {
        address: node.address,
        port: node.port,
        proxyUrl: node.proxyUrl,
    });
    return response.isOk ? null : response.message;
}
