import { AxiosError } from 'axios';

const RETRYABLE_CODES = new Set([
    'ECONNABORTED',
    'ECONNRESET',
    'EPIPE',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'ERR_NETWORK',
]);
const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);

export function isTransientAxiosError(error: unknown): boolean {
    if (!(error instanceof AxiosError)) return false;

    const status = error.response?.status;
    if (status !== undefined) return RETRYABLE_STATUSES.has(status);

    return RETRYABLE_CODES.has(error.code ?? '') || /socket hang up/i.test(error.message);
}

export async function retryTransient<T>(
    operation: () => Promise<T>,
    options: {
        attempts?: number;
        delayMs?: number;
        onRetry?: (error: unknown, attempt: number) => void;
    } = {},
): Promise<T> {
    const attempts = options.attempts ?? 2;
    const delayMs = options.delayMs ?? 500;

    for (let attempt = 1; ; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= attempts || !isTransientAxiosError(error)) throw error;

            options.onRetry?.(error, attempt);
            if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
}
