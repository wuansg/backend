import { z } from 'zod';

import { NODES_ROUTES, REST_API } from '../../../api';
import { getEndpointDetails } from '../../../constants';

export namespace GetNodeForwardingUsageCommand {
    export const url = REST_API.NODES.FORWARDING.GET_USAGE;
    export const TSQ_url = url(':uuid');
    export const endpointDetails = getEndpointDetails(
        NODES_ROUTES.FORWARDING.GET_USAGE(':uuid'),
        'get',
        'Get persisted node forwarding usage by date range',
        { scope: 'get-forwarding-usage', kind: 'read' },
    );
    export const RequestParamSchema = z.object({ uuid: z.uuid() });
    export const RequestQuerySchema = z
        .object({
            start: z.iso.date().optional(),
            end: z.iso.date().optional(),
        })
        .refine((value) => !value.start || !value.end || value.start <= value.end, {
            message: 'Start date must not exceed end date',
            path: ['end'],
        });
    export const ResponseSchema = z.object({
        response: z.object({
            start: z.iso.date(),
            end: z.iso.date(),
            uploadBytes: z.number().nonnegative(),
            downloadBytes: z.number().nonnegative(),
            totalBytes: z.number().nonnegative(),
            lastRecordedAt: z.string().datetime().nullable(),
            rules: z.array(
                z.object({
                    id: z.uuid(),
                    uploadBytes: z.number().nonnegative(),
                    downloadBytes: z.number().nonnegative(),
                    totalBytes: z.number().nonnegative(),
                    lastRecordedAt: z.string().datetime().nullable(),
                }),
            ),
        }),
    });
    export type RequestParam = z.infer<typeof RequestParamSchema>;
    export type RequestQuery = z.infer<typeof RequestQuerySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
