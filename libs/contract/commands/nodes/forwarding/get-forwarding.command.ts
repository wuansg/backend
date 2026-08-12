import { z } from 'zod';

import { NODES_ROUTES, REST_API } from '../../../api';
import { getEndpointDetails } from '../../../constants';
import { NodeForwardingConfigSchema, NodeForwardingRuntimeStatusSchema } from '../../../models';

export namespace GetNodeForwardingCommand {
    export const url = REST_API.NODES.FORWARDING.GET;
    export const TSQ_url = url(':uuid');
    export const endpointDetails = getEndpointDetails(
        NODES_ROUTES.FORWARDING.GET(':uuid'),
        'get',
        'Get node forwarding configuration and status',
        { scope: 'get-forwarding', kind: 'read' },
    );
    export const RequestParamSchema = z.object({ uuid: z.uuid() });
    export const ResponseSchema = z.object({
        response: z.object({
            config: NodeForwardingConfigSchema,
            status: NodeForwardingRuntimeStatusSchema,
        }),
    });
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
