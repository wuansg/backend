import { z } from 'zod';

import { NODES_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';

export namespace GetNodeObservabilityCommand {
    export const url = REST_API.NODES.OBSERVABILITY.GET;
    export const TSQ_url = url(':uuid');
    export const endpointDetails = getEndpointDetails(
        NODES_ROUTES.OBSERVABILITY.GET(':uuid'),
        'get',
        'Get Node network and Geocheck observability',
        { scope: 'observability', kind: 'read' },
    );
    export const RequestParamSchema = z.object({ uuid: z.uuid() });
    export const ResponseSchema = z.object({ response: z.record(z.string(), z.unknown()) });
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
