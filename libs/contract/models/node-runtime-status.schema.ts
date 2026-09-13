import { z } from 'zod';

export const NodeRuntimeModeSchema = z.enum(['CORE_ACTIVE', 'FORWARDING_ONLY', 'IDLE', 'DEGRADED']);

export const NodeRuntimeStatusSchema = z.object({
    mode: NodeRuntimeModeSchema,
    runningCore: z.literal('SING_BOX').nullable(),
    coreOnline: z.boolean(),
    capabilities: z.array(z.string()),
    supportedCores: z.array(z.literal('SING_BOX')),
    forwarding: z
        .object({
            state: z.string(),
            configHash: z.string().optional(),
            lastSyncedAt: z.iso.datetime().nullable().optional(),
            lastError: z.string().optional(),
            configuredRules: z.number().int().nonnegative(),
            enabledRules: z.number().int().nonnegative(),
            dnsResults: z.record(z.string(), z.string()),
            dnsStale: z.boolean().optional(),
            dnsLastResolvedAt: z.iso.datetime().nullable().optional(),
            dnsFailureCount: z.number().int().nonnegative().optional(),
        })
        .nullable(),
    usageSnapshot: z
        .object({
            supported: z.boolean(),
            active: z.boolean(),
            enabled: z.boolean().optional(),
            capturing: z.boolean().optional(),
        })
        .nullable(),
});

export type TNodeRuntimeMode = z.infer<typeof NodeRuntimeModeSchema>;
export type TNodeRuntimeStatus = z.infer<typeof NodeRuntimeStatusSchema>;
