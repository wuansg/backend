import { z } from 'zod';

import { MANAGEMENT_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';
import { TaggableManagementEntityTypeSchema } from './schemas';

export namespace GetManagementTagsCommand {
    export const url = REST_API.MANAGEMENT.TAGS;
    export const TSQ_url = url(':type');
    export const endpointDetails = getEndpointDetails(
        MANAGEMENT_ROUTES.TAGS(':type'),
        'get',
        'Get entity tags',
        { scope: 'list-tags', kind: 'read' },
    );
    export const RequestParamSchema = z.object({ type: TaggableManagementEntityTypeSchema });
    export const ResponseSchema = z.object({ response: z.object({ tags: z.array(z.string()) }) });
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
