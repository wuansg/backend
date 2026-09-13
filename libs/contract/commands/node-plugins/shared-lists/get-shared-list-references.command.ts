import { z } from 'zod';

import { NODE_PLUGINS_ROUTES, REST_API } from '../../../api';
import { getEndpointDetails } from '../../../constants';

export namespace GetSharedListReferencesCommand {
    export const url = REST_API.NODE_PLUGINS.SHARED_LISTS.REFERENCES;
    export const TSQ_url = url(':name');
    export const endpointDetails = getEndpointDetails(
        NODE_PLUGINS_ROUTES.SHARED_LISTS.REFERENCES(':name'),
        'get',
        'Get Shared List reference graph',
        { scope: 'references', kind: 'read' },
    );
    export const RequestParamSchema = z.object({ name: z.string().min(1).max(255) });
    export const ResponseSchema = z.object({ response: z.record(z.string(), z.unknown()) });
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
