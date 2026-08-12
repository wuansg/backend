import { z } from 'zod';

export const NodeForwardingProtocolSchema = z.enum(['TCP', 'UDP', 'TCP_UDP']);

export const NodeForwardingRuleSchema = z.object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(64),
    enabled: z.boolean(),
    protocol: NodeForwardingProtocolSchema,
    listenPort: z.number().int().min(1).max(65_535),
    targetAddress: z.ipv4(),
    targetPort: z.number().int().min(1).max(65_535),
});

export const NodeForwardingConfigSchema = z.object({
    enabled: z.boolean(),
    listenInterface: z
        .string()
        .trim()
        .min(1)
        .max(15)
        .regex(/^(auto|[a-zA-Z0-9_.-]+)$/),
    rules: z.array(NodeForwardingRuleSchema).max(64),
});

export const NodeForwardingCounterSchema = z.object({
    packets: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
});

export const NodeForwardingDirectionCountersSchema = z.object({
    upload: NodeForwardingCounterSchema,
    download: NodeForwardingCounterSchema,
});

export const NodeForwardingRuntimeStatusSchema = z.object({
    state: z.enum([
        'disabled',
        'pending',
        'applied',
        'degraded',
        'error',
        'unsupported',
        'unreachable',
    ]),
    desiredHash: z.string().optional(),
    appliedHash: z.string().optional(),
    appliedAt: z.string().datetime().nullable().optional(),
    resolvedListenInterface: z.string().optional(),
    lastError: z.string().optional(),
    forwardingEnabled: z.boolean().optional(),
    firewallForwardPolicy: z.enum(['accept', 'drop', 'unknown']).optional(),
    rules: z
        .array(
            z.object({
                id: z.uuid(),
                tcp: NodeForwardingDirectionCountersSchema.optional(),
                udp: NodeForwardingDirectionCountersSchema.optional(),
            }),
        )
        .default([]),
});

export type NodeForwardingConfig = z.infer<typeof NodeForwardingConfigSchema>;
export type NodeForwardingRuntimeStatus = z.infer<typeof NodeForwardingRuntimeStatusSchema>;
