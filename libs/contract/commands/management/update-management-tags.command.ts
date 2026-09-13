import { z } from 'zod';

import { MANAGEMENT_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';
import { ManagementTagsSchema, TaggableManagementEntityTypeSchema } from './schemas';

export namespace UpdateManagementTagsCommand {
    export const url = REST_API.MANAGEMENT.ENTITY_TAGS;
    export const TSQ_url = url(':type', ':uuid');
    export const endpointDetails = getEndpointDetails(
        MANAGEMENT_ROUTES.ENTITY_TAGS(':type', ':uuid'),
        'patch',
        'Update entity tags',
        { scope: 'tags', kind: 'write' },
    );
    export const RequestParamSchema = z.object({
        type: TaggableManagementEntityTypeSchema,
        uuid: z.uuid(),
    });
    export const RequestBodySchema = z.object({ tags: ManagementTagsSchema });
    export const ResponseSchema = z.object({ response: z.object({ tags: z.array(z.string()) }) });
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
