import { z } from 'zod';

import { getEndpointDetails } from '../../constants';
const id = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const day = z.iso.date();
const bytes = z
    .string()
    .regex(/^(0|[1-9][0-9]{0,18})$/)
    .refine((v) => BigInt(v) <= 9223372036854775807n);
export const AuditUserParamSchema = z.object({ userId: id });
export const AuditPolicyBodySchema = z
    .object({ enabled: z.boolean(), retentionDays: z.int().min(1).max(30).default(7) })
    .strict();
export const AuditQuerySchema = z
    .object({
        start: day.optional(),
        end: day.optional(),
        nodeUuid: z.uuid().optional(),
        domain: z.string().trim().max(253).optional(),
        cursor: z
            .string()
            .regex(/^[1-9][0-9]{0,18}$/)
            .refine((v) => BigInt(v) <= 9223372036854775807n)
            .optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        userId: id.optional(),
    })
    .superRefine((v, ctx) => {
        if (
            Boolean(v.start) !== Boolean(v.end) ||
            (v.start &&
                v.end &&
                (v.start > v.end || Date.parse(v.end) - Date.parse(v.start) > 29 * 86400000))
        )
            ctx.addIssue({
                code: 'custom',
                message: 'Use an ordered date range of at most 30 days',
                path: ['start'],
            });
    });
export const AgentAuditRecordSchema = z.object({
    connectionId: z.uuid(),
    windowId: z.uuid(),
    userId: z.string().regex(/^[1-9][0-9]{0,18}$/),
    domain: z
        .string()
        .max(253)
        .regex(/^[^\s\x00-\x1f\x7f\/:@?#]*$/),
    destinationIp: z.ipv4().or(z.ipv6()).or(z.literal('')),
    destinationPort: z.int().min(0).max(65535),
    inbound: z
        .string()
        .max(128)
        .regex(/^[^\x00-\x1f\x7f]*$/),
    network: z
        .string()
        .max(16)
        .regex(/^[^\x00-\x1f\x7f]*$/),
    protocol: z
        .string()
        .max(32)
        .regex(/^[^\x00-\x1f\x7f]*$/),
    startedAt: z.iso.datetime({ offset: true }),
    observedAt: z.iso.datetime({ offset: true }),
    closedAt: z.iso.datetime({ offset: true }).nullable(),
    upload: bytes,
    download: bytes,
    partial: z.boolean(),
    sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
export const AgentAuditBatchSchema = z.object({
    generation: z.string().regex(/^[a-f0-9]{32}$/),
    records: z.array(AgentAuditRecordSchema).max(500),
    hasMore: z.boolean(),
});
export const AgentAuditStatusSchema = z.object({
    generation: z.string().regex(/^[a-f0-9]{32}$/),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    enabledUsers: z.int().min(0).max(10000),
    capturing: z.boolean(),
    pending: z.int().nonnegative(),
    dropped: z.number().int().nonnegative(),
    lastError: z.string().max(256),
    expiresAt: z.iso.datetime({ offset: true }),
});
export const AuditPolicyViewSchema = z.object({
    enabled: z.boolean(),
    retentionDays: z.int().min(1).max(30),
    enabledAt: z.iso.datetime({ offset: true }).nullable(),
    nodes: z.array(
        z.object({
            uuid: z.uuid(),
            name: z.string(),
            connected: z.boolean(),
            mode: z.string(),
            supported: z.boolean(),
            syncedAt: z.iso.datetime({ offset: true }).nullable(),
            lastError: z.string().nullable(),
            status: AgentAuditStatusSchema.partial(),
        }),
    ),
});
export const AuditRecordViewSchema = AgentAuditRecordSchema.omit({
    sequence: true,
    windowId: true,
    connectionId: true,
    userId: true,
}).extend({
    id: z.string(),
    userId: id,
    username: z.string(),
    nodeUuid: z.uuid(),
    nodeName: z.string(),
});
export const AuditRecordsViewSchema = z.object({
    records: z.array(AuditRecordViewSchema),
    nextCursor: z.string().nullable(),
});
export const AuditDomainsViewSchema = z.array(
    z.object({
        domain: z.string(),
        destinationIp: z.string(),
        connections: z.int().nonnegative(),
        upload: z.string().regex(/^(0|[1-9][0-9]*)$/),
        download: z.string().regex(/^(0|[1-9][0-9]*)$/),
    }),
);
export namespace GetAuditPolicyCommand {
    export const endpointDetails = getEndpointDetails(
        'users/:userId/policy',
        'get',
        'Get user access audit policy',
        { scope: 'policy-read', kind: 'read' },
    );
    export const ResponseSchema = z.object({ response: AuditPolicyViewSchema });
}
export namespace SetAuditPolicyCommand {
    export const endpointDetails = getEndpointDetails(
        'users/:userId/policy',
        'put',
        'Explicitly enable or disable user access audit',
        { scope: 'policy-write', kind: 'write' },
    );
    export const ResponseSchema = z.object({ response: AuditPolicyViewSchema });
}
export namespace GetAuditRecordsCommand {
    export const endpointDetails = getEndpointDetails(
        'records',
        'get',
        'Query user access audit records',
        { scope: 'records-read', kind: 'read' },
    );
    export const ResponseSchema = z.object({ response: AuditRecordsViewSchema });
}
export namespace GetAuditDomainsCommand {
    export const endpointDetails = getEndpointDetails(
        'domains',
        'get',
        'Get access audit domain ranking',
        { scope: 'domains-read', kind: 'read' },
    );
    export const ResponseSchema = z.object({ response: AuditDomainsViewSchema });
}
