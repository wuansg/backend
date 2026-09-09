import { ResolvedProxyConfigSchema } from '@libs/contracts/models';

import { ResolvedProxyConfig } from '../interfaces';

export type ParsedResolvedProxyRemark =
    | { kind: 'invalid'; error: string }
    | { kind: 'plain' }
    | { kind: 'resolved'; config: ResolvedProxyConfig };

const RAW_REMARK_MARKER = /^\{\s*"finalRemark"(?:\s*:)?/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Custom remarks may be arbitrary text, including text beginning with `{`.
 * Only the internal serialized proxy shape is parsed as a resolved proxy config.
 */
export function parseResolvedProxyRemark(remark: string): ParsedResolvedProxyRemark {
    const trimmed = remark.trim();

    if (!trimmed.startsWith('{')) return { kind: 'plain' };

    let parsed: unknown;

    try {
        parsed = JSON.parse(trimmed) as unknown;
    } catch (error) {
        if (!RAW_REMARK_MARKER.test(trimmed)) return { kind: 'plain' };

        return {
            kind: 'invalid',
            error: error instanceof Error ? error.message : 'Invalid JSON',
        };
    }

    if (!isRecord(parsed) || !Object.hasOwn(parsed, 'finalRemark')) {
        return { kind: 'plain' };
    }

    const result = ResolvedProxyConfigSchema.safeParse(parsed);

    if (!result.success) {
        return { kind: 'invalid', error: result.error.message };
    }

    return {
        kind: 'resolved',
        config: result.data as ResolvedProxyConfig,
    };
}
