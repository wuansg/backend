import { z } from 'zod';

import { BANDWIDTH_STATS_ROUTES, REST_API } from '../../../api';
import { getEndpointDetails } from '../../../constants';

export namespace GetStatsHostsUsageCommand {
    export const url = REST_API.BANDWIDTH_STATS.HOSTS.GET;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        BANDWIDTH_STATS_ROUTES.HOSTS.GET,
        'get',
        'Get Hosts Usage by Range',
        { scope: 'hosts-usage', kind: 'read' },
    );

    export const RequestQuerySchema = z.object({
        start: z.string().date(),
        end: z.string().date(),
        topHostsLimit: z.coerce.number().min(1).default(20),
    });

    export type RequestQuery = z.infer<typeof RequestQuerySchema>;

    const HostUsageMemberSchema = z.object({
        uuid: z.string().uuid(),
        remark: z.string(),
        address: z.string(),
        port: z.number(),
    });

    const HostUsageItemSchema = z.object({
        uuid: z.string().uuid(),
        groupKey: z.string(),
        nodeUuid: z.string().uuid(),
        inboundTag: z.string(),
        color: z.string(),
        remark: z.string(),
        address: z.string(),
        port: z.number(),
        tag: z.string().nullable(),
        isShared: z.boolean(),
        hosts: z.array(HostUsageMemberSchema),
        total: z.number(),
    });

    export const ResponseSchema = z.object({
        response: z.object({
            categories: z.array(z.string()),
            sparklineData: z.array(z.number()),
            topHosts: z.array(HostUsageItemSchema),
            series: z.array(
                HostUsageItemSchema.extend({
                    data: z.array(z.number()),
                }),
            ),
        }),
    });

    export type Response = z.infer<typeof ResponseSchema>;
}
