import { z } from 'zod';

import { NODES_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';

export namespace UpdateNodeGeocheckCommand {
    export const url = REST_API.NODES.OBSERVABILITY.UPDATE_GEOCHECK;
    export const TSQ_url = url(':uuid');
    export const endpointDetails = getEndpointDetails(
        NODES_ROUTES.OBSERVABILITY.UPDATE_GEOCHECK(':uuid'),
        'patch',
        'Update scheduled Geocheck settings',
        { scope: 'observability', kind: 'write' },
    );
    export const RequestParamSchema = z.object({ uuid: z.uuid() });
    export const RequestBodySchema = z.object({
        intervalMinutes: z.number().int().min(5).max(10_080).nullable(),
        cooldownMinutes: z.number().int().min(1).max(10_080).default(60),
        source: z
            .discriminatedUnion('type', [
                z.object({ type: z.literal('DEFAULT') }),
                z.object({ type: z.literal('IP'), value: z.string().min(1).max(255) }),
                z.object({ type: z.literal('INTERFACE'), value: z.string().min(1).max(255) }),
            ])
            .nullable(),
    });
    export const ResponseSchema = z.object({ response: z.record(z.string(), z.unknown()) });
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
