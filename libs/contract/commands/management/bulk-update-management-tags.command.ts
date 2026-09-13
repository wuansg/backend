import { z } from 'zod';

import { MANAGEMENT_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';
import { ManagementTagsSchema, TaggableManagementEntityTypeSchema } from './schemas';

export namespace BulkUpdateManagementTagsCommand {
    export const url = REST_API.MANAGEMENT.TAGS;
    export const TSQ_url = url(':type');
    export const endpointDetails = getEndpointDetails(
        MANAGEMENT_ROUTES.TAGS(':type'),
        'patch',
        'Bulk update entity tags',
        { scope: 'bulk-update-tags', kind: 'write' },
    );
    export const RequestParamSchema = z.object({ type: TaggableManagementEntityTypeSchema });
    export const RequestBodySchema = z.object({
        uuids: z.array(z.uuid()).min(1).max(100),
        tags: ManagementTagsSchema,
        mode: z.enum(['REPLACE', 'ADD', 'REMOVE']).default('REPLACE'),
    });
    export const ResponseSchema = z.object({ response: z.object({ updated: z.number().int() }) });
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
