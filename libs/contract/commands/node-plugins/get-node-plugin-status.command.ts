import { z } from 'zod';

import { NODE_PLUGINS_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';

export namespace GetNodePluginStatusCommand {
    export const url = REST_API.NODE_PLUGINS.STATUS;
    export const TSQ_url = url(':uuid');
    export const endpointDetails = getEndpointDetails(
        NODE_PLUGINS_ROUTES.STATUS(':uuid'),
        'get',
        'Get Node Plugin deployment status',
        { scope: 'status', kind: 'read' },
    );
    export const RequestParamSchema = z.object({ uuid: z.uuid() });
    export const ResponseSchema = z.object({
        response: z.object({ deployments: z.array(z.record(z.string(), z.unknown())) }),
    });
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
