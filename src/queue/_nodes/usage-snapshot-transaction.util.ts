import type { UsageSnapshot } from '@common/axios';

const RETRYABLE_DATABASE_CODES = new Set(['40P01', '40001', 'P2034']);

export interface DatabaseTransactionRetryOptions {
    maxAttempts?: number;
    delayMs?: number;
    onRetry?: (error: unknown, retry: number) => Promise<void> | void;
}

export function isRetryableDatabaseTransactionError(error: unknown): boolean {
    const candidates: unknown[] = [error];
    const seen = new Set<unknown>();

    while (candidates.length > 0) {
        const candidate = candidates.shift();
        if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) continue;
        seen.add(candidate);

        const record = candidate as Record<string, unknown>;
        if (typeof record.code === 'string' && RETRYABLE_DATABASE_CODES.has(record.code)) {
            return true;
        }
        if (record.meta) candidates.push(record.meta);
        if (record.cause) candidates.push(record.cause);
    }

    return false;
}

export async function retryDatabaseTransaction<T>(
    operation: () => Promise<T>,
    options: DatabaseTransactionRetryOptions = {},
): Promise<T> {
    const maxAttempts = Math.max(1, options.maxAttempts ?? 4);
    const delayMs = Math.max(0, options.delayMs ?? 25);

    for (let attempt = 1; ; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= maxAttempts || !isRetryableDatabaseTransactionError(error)) {
                throw error;
            }
            await options.onRetry?.(error, attempt);
            if (delayMs > 0) {
                const backoff = delayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * delayMs);
                await new Promise((resolve) => setTimeout(resolve, backoff));
            }
        }
    }
}

export function collectSortedUsageUserIds(snapshots: readonly UsageSnapshot[]): bigint[] {
    const ids = new Set<string>();
    for (const snapshot of snapshots) {
        for (const counter of snapshot.counters) {
            if (counter.kind === 'user' && /^\d+$/.test(counter.name)) ids.add(counter.name);
        }
    }
    return [...ids].map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
