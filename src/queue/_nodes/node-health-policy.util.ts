export const NODE_HEALTH_FAILURE_THRESHOLD = 3;
export const NODE_HEALTH_RECOVERY_THRESHOLD = 2;
export const NODE_HEALTH_STATE_TTL_SECONDS = 3_600;
export const NODE_REPAIR_BACKOFF_TTL_SECONDS = 86_400;

export interface NodeRepairBackoff {
    attempts: number;
    nextAttemptAt: number;
}

export function shouldEscalateNodeHealthFailure(failures: number): boolean {
    return failures >= NODE_HEALTH_FAILURE_THRESHOLD;
}

export function shouldRestoreNodeHealth(successes: number): boolean {
    return successes >= NODE_HEALTH_RECOVERY_THRESHOLD;
}

export function nextNodeRepairBackoff(
    previous: NodeRepairBackoff | null,
    now: number,
): NodeRepairBackoff | null {
    if (previous && previous.nextAttemptAt > now) return null;

    const attempts = (previous?.attempts ?? 0) + 1;
    const delaySeconds = Math.min(30 * 2 ** (attempts - 1), 300);
    return { attempts, nextAttemptAt: now + delaySeconds * 1_000 };
}
