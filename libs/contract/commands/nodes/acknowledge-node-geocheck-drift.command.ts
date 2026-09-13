import { z } from 'zod';

import { NODES_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';

export namespace AcknowledgeNodeGeocheckDriftCommand {
    export const url = REST_API.NODES.OBSERVABILITY.ACK_DRIFT;
    export const TSQ_url = url(':uuid', ':eventId');
    export const endpointDetails = getEndpointDetails(
        NODES_ROUTES.OBSERVABILITY.ACK_DRIFT(':uuid', ':eventId'),
        'post',
        'Acknowledge Node Geocheck drift',
        { scope: 'observability', kind: 'write' },
    );
    export const RequestParamSchema = z.object({
        uuid: z.uuid(),
        eventId: z.string().regex(/^\d+$/),
    });
    export const ResponseSchema = z.object({ response: z.object({ acknowledged: z.boolean() }) });
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
