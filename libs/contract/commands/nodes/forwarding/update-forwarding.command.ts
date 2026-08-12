import { z } from 'zod';

import { NODES_ROUTES, REST_API } from '../../../api';
import { getEndpointDetails } from '../../../constants';
import { NodeForwardingConfigSchema, NodeForwardingRuntimeStatusSchema } from '../../../models';

export namespace UpdateNodeForwardingCommand {
    export const url = REST_API.NODES.FORWARDING.UPDATE;
    export const TSQ_url = url(':uuid');
    export const endpointDetails = getEndpointDetails(
        NODES_ROUTES.FORWARDING.UPDATE(':uuid'),
        'put',
        'Update and apply node forwarding configuration',
        { scope: 'update', kind: 'write' },
    );
    export const RequestParamSchema = z.object({ uuid: z.uuid() });
    export const RequestBodySchema = NodeForwardingConfigSchema;
    export const ResponseSchema = z.object({
        response: z.object({
            config: NodeForwardingConfigSchema,
            status: NodeForwardingRuntimeStatusSchema,
        }),
    });
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
