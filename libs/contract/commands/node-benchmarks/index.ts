import { z } from 'zod';

import { getEndpointDetails } from '../../constants';

export const BENCHMARK_CITIES = [
    'hong-kong',
    'singapore',
    'tokyo',
    'osaka',
    'los-angeles',
    'seattle',
    'dallas',
    'new-york',
    'london',
    'frankfurt',
    'amsterdam',
    'paris',
] as const;
const httpsURL = z
    .string()
    .max(2048)
    .url()
    .refine((value) => {
        try {
            const u = new URL(value);
            return (
                u.protocol === 'https:' &&
                !u.username &&
                !u.password &&
                !u.hash &&
                (!u.port || ['443', '8443'].includes(u.port))
            );
        } catch {
            return false;
        }
    }, 'Use HTTPS without credentials, on port 443 or 8443');
const testURL = z
    .string()
    .max(2048)
    .url()
    .refine((value) => {
        try {
            const u = new URL(value);
            return (
                ['http:', 'https:'].includes(u.protocol) &&
                !u.username &&
                !u.password &&
                !u.hash &&
                (!u.port || ['80', '443', '8443'].includes(u.port))
            );
        } catch {
            return false;
        }
    }, 'Use HTTP(S) without credentials, on port 80, 443 or 8443');
export const BenchmarkTargetSchema = z.object({
    id: z.enum(BENCHMARK_CITIES),
    city: z.string().min(1).max(64),
    provider: z.string().min(1).max(128),
    downloadUrl: testURL,
    uploadUrl: testURL.or(z.literal('')).default(''),
    policyUrl: httpsURL,
});
export const BenchmarkRequestSchema = z
    .object({
        kind: z.enum(['HARDWARE', 'NETWORK']),
        items: z
            .array(z.enum(['cpu', 'memory', 'disk', 'latency', 'download', 'upload']))
            .min(1)
            .max(3),
        cities: z.array(z.enum(BENCHMARK_CITIES)).max(12).default([]),
        family: z.enum(['IPv4', 'IPv6']).default('IPv4'),
        sourceIp: z.ipv4().or(z.ipv6()).or(z.literal('')).default(''),
        interface: z
            .string()
            .max(64)
            .regex(/^[a-zA-Z0-9_.:-]*$/)
            .default(''),
        seconds: z.int().min(1).max(15).default(10),
        bytesPerDirection: z.int().min(1048576).max(268435456).default(33554432),
        threads: z.int().min(1).max(8).default(1),
    })
    .superRefine((v, ctx) => {
        const allowed =
            v.kind === 'HARDWARE' ? ['cpu', 'memory', 'disk'] : ['latency', 'download', 'upload'];
        if (v.items.some((i) => !allowed.includes(i)) || new Set(v.items).size !== v.items.length)
            ctx.addIssue({ code: 'custom', message: 'Invalid test items', path: ['items'] });
        if (
            new Set(v.cities).size !== v.cities.length ||
            (v.kind === 'NETWORK' && !v.cities.length) ||
            (v.kind === 'HARDWARE' && v.cities.length)
        )
            ctx.addIssue({ code: 'custom', message: 'Invalid city selection', path: ['cities'] });
        if (v.sourceIp && v.interface)
            ctx.addIssue({
                code: 'custom',
                message: 'Choose source IP or interface',
                path: ['sourceIp'],
            });
        if (v.sourceIp && z.ipv4().safeParse(v.sourceIp).success !== (v.family === 'IPv4'))
            ctx.addIssue({
                code: 'custom',
                message: 'Source IP does not match the address family',
                path: ['sourceIp'],
            });
    });
export const BenchmarkItemSchema = z.object({
    name: z.string().max(64),
    status: z.enum(['COMPLETED', 'FAILED', 'SKIPPED']),
    message: z.string().max(512).optional(),
    metrics: z.record(z.string(), z.unknown()),
});
export const BenchmarkJobSchema = z.object({
    id: z.uuid(),
    nodeUuid: z.uuid(),
    kind: z.enum(['HARDWARE', 'NETWORK']),
    status: z.string(),
    phase: z.string(),
    progress: z.number(),
    request: z.unknown(),
    results: z.array(BenchmarkItemSchema),
    message: z.string().nullable(),
    createdAt: z.string(),
    finishedAt: z.string().nullable(),
});
const nodeParam = z.object({ nodeUuid: z.uuid() });
const jobParam = nodeParam.extend({ id: z.uuid() });
const prefix = '/api/connections/benchmarks';
export namespace CreateNodeBenchmarkCommand {
    export const url = (nodeUuid: string) => `${prefix}/nodes/${nodeUuid}`;
    export const TSQ_url = url(':nodeUuid');
    export const endpointDetails = getEndpointDetails(
        'benchmarks/nodes/:nodeUuid',
        'post',
        'Start node benchmark',
        { scope: 'benchmark-start', kind: 'write' },
    );
    export const RequestParamSchema = nodeParam;
    export const RequestBodySchema = BenchmarkRequestSchema;
    export const ResponseSchema = z.object({ response: BenchmarkJobSchema });
}
export namespace GetNodeBenchmarksCommand {
    export const url = CreateNodeBenchmarkCommand.url;
    export const TSQ_url = url(':nodeUuid');
    export const endpointDetails = getEndpointDetails(
        'benchmarks/nodes/:nodeUuid',
        'get',
        'List node benchmark history',
        { scope: 'benchmark-list', kind: 'read' },
    );
    export const RequestParamSchema = nodeParam;
    export const ResponseSchema = z.object({ response: z.array(BenchmarkJobSchema) });
}
export namespace GetNodeBenchmarkCommand {
    export const url = (nodeUuid: string, id: string) => `${prefix}/nodes/${nodeUuid}/${id}`;
    export const TSQ_url = url(':nodeUuid', ':id');
    export const endpointDetails = getEndpointDetails(
        'benchmarks/nodes/:nodeUuid/:id',
        'get',
        'Get node benchmark progress',
        { scope: 'benchmark-get', kind: 'read' },
    );
    export const RequestParamSchema = jobParam;
    export const ResponseSchema = z.object({ response: BenchmarkJobSchema });
}
export namespace CancelNodeBenchmarkCommand {
    export const url = (nodeUuid: string, id: string) => `${prefix}/nodes/${nodeUuid}/${id}/cancel`;
    export const TSQ_url = url(':nodeUuid', ':id');
    export const endpointDetails = getEndpointDetails(
        'benchmarks/nodes/:nodeUuid/:id/cancel',
        'post',
        'Cancel node benchmark',
        { scope: 'benchmark-cancel', kind: 'write' },
    );
    export const RequestParamSchema = jobParam;
    export const ResponseSchema = GetNodeBenchmarkCommand.ResponseSchema;
}
export namespace GetBenchmarkTargetsCommand {
    export const url = `${prefix}/targets`;
    export const endpointDetails = getEndpointDetails(
        'benchmarks/targets',
        'get',
        'List benchmark city endpoints',
        { scope: 'benchmark-targets', kind: 'read' },
    );
    export const ResponseSchema = z.object({ response: z.array(BenchmarkTargetSchema) });
}
export namespace UpdateBenchmarkTargetCommand {
    export const url = (id: string) => `${prefix}/targets/${id}`;
    export const TSQ_url = url(':id');
    export const endpointDetails = getEndpointDetails(
        'benchmarks/targets/:id',
        'put',
        'Update benchmark city endpoint',
        { scope: 'benchmark-target-update', kind: 'write' },
    );
    export const RequestParamSchema = z.object({ id: z.enum(BENCHMARK_CITIES) });
    export const RequestBodySchema = BenchmarkTargetSchema;
    export const ResponseSchema = z.object({ response: BenchmarkTargetSchema });
}
