import { z } from 'zod';

import { NODES_ROUTES, REST_API } from '../../../api';
import { getEndpointDetails } from '../../../constants';

const bytes = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const TopologyUsageSchema = z.object({
    upload: bytes,
    download: bytes,
    total: bytes,
    lastRecordedAt: z.iso.datetime().nullable(),
    shared: z.boolean(),
});
const transport = z.enum(['TCP', 'UDP', 'TCP_UDP', 'UNKNOWN']);
export const ForwardingTopologySchema = z.object({
    generatedAt: z.iso.datetime(),
    start: z.iso.date(),
    end: z.iso.date(),
    nodes: z.array(
        z.object({
            uuid: z.uuid(),
            name: z.string(),
            address: z.string(),
            countryCode: z.string(),
            provider: z.string().nullable(),
            connected: z.boolean(),
            disabled: z.boolean(),
            mode: z.string(),
            coreOnline: z.boolean(),
            reportedAt: z.iso.datetime().nullable(),
            stale: z.boolean(),
            configPending: z.boolean(),
            configBlocked: z.boolean(),
            forwardingState: z.string(),
            configValid: z.boolean(),
            hashMatches: z.boolean(),
            dnsStale: z.boolean(),
            dnsReportedAt: z.iso.datetime().nullable(),
            inbounds: z.array(
                z.object({
                    uuid: z.uuid(),
                    tag: z.string(),
                    protocol: z.string(),
                    port: z.int().min(1).max(65535).nullable(),
                    transport,
                }),
            ),
            quota: z.object({
                tracking: z.boolean(),
                used: bytes,
                limit: bytes,
                resetDay: z.int().nullable(),
            }),
            coreUsage: TopologyUsageSchema,
            snapshot: z
                .object({
                    lastSuccessAt: z.iso.datetime().nullable(),
                    pending: bytes,
                    gap: bytes,
                    error: z.boolean(),
                })
                .nullable(),
            exitObservation: z
                .object({
                    ip: z.string().nullable(),
                    asn: z.string().nullable(),
                    country: z.string().nullable(),
                    observedAt: z.iso.datetime(),
                    sourceType: z.string(),
                })
                .nullable(),
        }),
    ),
    rules: z.array(
        z.object({
            key: z.string(),
            id: z.uuid(),
            nodeUuid: z.uuid(),
            name: z.string(),
            enabled: z.boolean(),
            protocol: transport,
            listenPort: z.int().min(1).max(65535),
            targetAddress: z.string(),
            targetPort: z.int().min(1).max(65535),
            resolvedTargetAddress: z.string().nullable(),
            resolution: z.enum(['LITERAL', 'OBSERVED', 'STALE', 'MISSING']),
            targetNodeUuids: z.array(z.uuid()),
            targetMatch: z.enum(['ADDRESS', 'DNS', 'AMBIGUOUS', 'NONE']),
            state: z.enum([
                'DISABLED',
                'UNREPORTED',
                'STALE',
                'PENDING',
                'APPLIED',
                'DEGRADED',
                'ERROR',
                'OFFLINE',
            ]),
            usage: TopologyUsageSchema,
            protocols: z.array(
                z.object({ protocol: z.enum(['TCP', 'UDP']), usage: TopologyUsageSchema }),
            ),
        }),
    ),
    hosts: z.array(
        z.object({
            uuid: z.uuid(),
            remark: z.string(),
            address: z.string(),
            port: z.int(),
            disabled: z.boolean(),
            protocol: z.string().nullable(),
            transport,
            inboundUuid: z.uuid().nullable(),
            boundNodeUuids: z.array(z.uuid()),
            entryNodeUuids: z.array(z.uuid()),
            entryMatch: z.enum(['ADDRESS', 'DNS', 'AMBIGUOUS', 'NONE']),
            usage: TopologyUsageSchema,
        }),
    ),
    orphanUsage: z.array(
        z.object({ nodeUuid: z.uuid(), ruleId: z.uuid(), usage: TopologyUsageSchema }),
    ),
});
export type ForwardingTopology = z.infer<typeof ForwardingTopologySchema>;
export type TopologyUsage = z.infer<typeof TopologyUsageSchema>;

export namespace GetForwardingTopologyCommand {
    export const url = REST_API.NODES.FORWARDING.TOPOLOGY;
    export const TSQ_url = url;
    export const endpointDetails = getEndpointDetails(
        NODES_ROUTES.FORWARDING.TOPOLOGY,
        'get',
        'Get read-only forwarding topology and independent usage',
        { scope: 'get-forwarding-topology', kind: 'read' },
    );
    export const RequestQuerySchema = z
        .object({
            start: z.iso.date().optional(),
            end: z.iso.date().optional(),
        })
        .superRefine((value, ctx) => {
            const start = value.start ?? new Date().toISOString().slice(0, 10);
            const end = value.end ?? start;
            if (start > end || Date.parse(end) - Date.parse(start) > 365 * 86400000)
                ctx.addIssue({
                    code: 'custom',
                    message: 'Use an ordered range of at most 366 days',
                    path: ['end'],
                });
        });
    export const ResponseSchema = z.object({ response: ForwardingTopologySchema });
    export type RequestQuery = z.infer<typeof RequestQuerySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
