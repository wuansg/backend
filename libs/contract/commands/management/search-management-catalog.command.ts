import { z } from 'zod';

import { MANAGEMENT_ROUTES, REST_API } from '../../api';
import { getEndpointDetails } from '../../constants';
import { ManagementEntityTypeSchema } from './schemas';

export namespace SearchManagementCatalogCommand {
    export const url = REST_API.MANAGEMENT.SEARCH;
    export const TSQ_url = url;
    export const endpointDetails = getEndpointDetails(
        MANAGEMENT_ROUTES.SEARCH,
        'get',
        'Search management catalog',
        { scope: 'search', kind: 'read' },
    );
    export const RequestQuerySchema = z.object({
        q: z.string().trim().max(80).default(''),
        tag: z.string().trim().max(32).optional(),
        types: z.string().max(255).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
    });
    export const ItemSchema = z.object({
        type: ManagementEntityTypeSchema,
        id: z.string(),
        name: z.string(),
        tags: z.array(z.string()),
        href: z.string(),
        description: z.string().nullable(),
    });
    export const ResponseSchema = z.object({
        response: z.object({ items: z.array(ItemSchema), total: z.number().int() }),
    });
    export type RequestQuery = z.infer<typeof RequestQuerySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
