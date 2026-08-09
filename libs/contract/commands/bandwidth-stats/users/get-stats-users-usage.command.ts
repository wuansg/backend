import { z } from 'zod';

import { BANDWIDTH_STATS_ROUTES, REST_API } from '../../../api';
import { getEndpointDetails } from '../../../constants';

export namespace GetStatsUsersUsageCommand {
    export const url = REST_API.BANDWIDTH_STATS.USERS.GET;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        BANDWIDTH_STATS_ROUTES.USERS.GET,
        'get',
        'Get Users Usage by Range',
        { scope: 'users-usage', kind: 'read' },
    );

    export const RequestQuerySchema = z.object({
        start: z.string().date(),
        end: z.string().date(),
        topUsersLimit: z.coerce.number().min(1).default(100),
    });

    export type RequestQuery = z.infer<typeof RequestQuerySchema>;

    export const ResponseSchema = z.object({
        response: z.object({
            categories: z.array(z.string()),
            sparklineData: z.array(z.number()),
            topUsers: z.array(
                z.object({
                    id: z.number().int().positive(),
                    color: z.string(),
                    username: z.string(),
                    total: z.number(),
                }),
            ),
            series: z.array(
                z.object({
                    id: z.number().int().positive(),
                    color: z.string(),
                    username: z.string(),
                    total: z.number(),
                    data: z.array(z.number()),
                }),
            ),
        }),
    });

    export type Response = z.infer<typeof ResponseSchema>;
}
