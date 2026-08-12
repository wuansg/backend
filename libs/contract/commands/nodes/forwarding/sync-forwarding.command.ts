import { z } from 'zod';

import { NODES_ROUTES, REST_API } from '../../../api';
import { getEndpointDetails } from '../../../constants';
import { NodeForwardingConfigSchema, NodeForwardingRuntimeStatusSchema } from '../../../models';

export namespace SyncNodeForwardingCommand {
    export const url = REST_API.NODES.FORWARDING.SYNC;
    export const TSQ_url = url(':uuid');
    export const endpointDetails = getEndpointDetails(
        NODES_ROUTES.FORWARDING.SYNC(':uuid'),
        'post',
        'Synchronize node forwarding configuration',
        { scope: 'sync-forwarding', kind: 'write' },
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
