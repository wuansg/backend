import { Prisma, PrismaClient } from '@prisma/client';

/** Hourly user inbound usage is kept this long, then folded into daily rows. */
export const USAGE_HISTORY_HOURLY_RETENTION_DAYS = 180;

const DAY_MS = 86_400_000;

export interface UsageHistoryCompactionResult {
    compactedDays: string[];
    compactedBefore: string | null;
}

/**
 * Folds hourly user_inbound_usage_history rows older than the retention
 * window into one row per (user, node, inbound, UTC day). Sums stay exact.
 *
 * hosts_usage_history stays hourly: it is small (Hosts x hours) and keeping it
 * exact avoids re-deduplicating shared inbounds. Each Host seen on a compacted
 * day gets a zero-byte midnight row so the user_hosts_usage_history view can
 * join the daily user rows; zero bytes do not change any sum.
 *
 * Each day is one transaction; progress is stored so a missed run catches up.
 */
export async function compactUsageHistory(
    prisma: PrismaClient,
    options: { now?: Date; retentionDays?: number; maxDays?: number } = {},
): Promise<UsageHistoryCompactionResult> {
    const now = options.now ?? new Date();
    const retentionDays = options.retentionDays ?? USAGE_HISTORY_HOURLY_RETENTION_DAYS;
    const maxDays = options.maxDays ?? 31;
    const cutoff = utcDay(new Date(now.getTime() - retentionDays * DAY_MS));
    const compactedDays: string[] = [];

    let next: Date | null = await getCompactedBefore(prisma);
    if (!next) {
        const [oldest] = await prisma.$queryRaw<Array<{ day: Date | null }>>(Prisma.sql`
            SELECT min(created_at)::date AS day FROM user_inbound_usage_history
        `);
        if (!oldest?.day) return { compactedDays, compactedBefore: null };
        next = utcDay(oldest.day);
    }

    while (next < cutoff && compactedDays.length < maxDays) {
        const day: Date = next;
        const done = await prisma.$transaction(
            async (tx) => {
                // The singleton row serializes overlapping runs.
                const [state] = await tx.$queryRaw<Array<{ compactedBefore: Date | null }>>(
                    Prisma.sql`
                        SELECT compacted_before AS "compactedBefore"
                        FROM usage_history_compaction_state WHERE id = 1 FOR UPDATE
                    `,
                );
                if (state?.compactedBefore && utcDay(state.compactedBefore) > day) return false;
                await compactDay(tx, day);
                await tx.$executeRaw(Prisma.sql`
                    UPDATE usage_history_compaction_state
                    SET compacted_before = ${isoDate(new Date(day.getTime() + DAY_MS))}::date,
                        updated_at = now()
                    WHERE id = 1
                `);
                return true;
            },
            { timeout: 120_000 },
        );
        if (done) compactedDays.push(isoDate(day));
        next = (await getCompactedBefore(prisma)) ?? new Date(day.getTime() + DAY_MS);
    }

    const compactedBefore = await getCompactedBefore(prisma);
    return { compactedDays, compactedBefore: compactedBefore ? isoDate(compactedBefore) : null };
}

async function compactDay(tx: Prisma.TransactionClient, day: Date): Promise<void> {
    const date = isoDate(day);

    await tx.$executeRaw(Prisma.sql`
        INSERT INTO hosts_usage_history (
            host_uuid, node_uuid, inbound_tag, download_bytes, upload_bytes,
            total_bytes, is_shared, created_at
        )
        SELECT host_uuid, node_uuid, inbound_tag, 0, 0, 0, bool_or(is_shared),
               ${date}::date::timestamp
        FROM hosts_usage_history
        WHERE created_at >= ${date}::date::timestamp
          AND created_at < (${date}::date + 1)::timestamp
        GROUP BY host_uuid, node_uuid, inbound_tag
        ON CONFLICT (host_uuid, node_uuid, inbound_tag, created_at) DO UPDATE SET
            is_shared = hosts_usage_history.is_shared OR EXCLUDED.is_shared
    `);

    // The midnight hour row doubles as the daily row, so only later hours move.
    await tx.$executeRaw(Prisma.sql`
        WITH moved AS (
            DELETE FROM user_inbound_usage_history
            WHERE created_at > ${date}::date::timestamp
              AND created_at < (${date}::date + 1)::timestamp
            RETURNING user_id, node_uuid, inbound_tag, download_bytes, upload_bytes,
                      total_bytes, updated_at
        )
        INSERT INTO user_inbound_usage_history (
            user_id, node_uuid, inbound_tag, download_bytes, upload_bytes,
            total_bytes, created_at, updated_at
        )
        SELECT user_id, node_uuid, inbound_tag, sum(download_bytes)::bigint,
               sum(upload_bytes)::bigint, sum(total_bytes)::bigint,
               ${date}::date::timestamp, max(updated_at)
        FROM moved
        GROUP BY user_id, node_uuid, inbound_tag
        ON CONFLICT (user_id, node_uuid, inbound_tag, created_at) DO UPDATE SET
            download_bytes = user_inbound_usage_history.download_bytes + EXCLUDED.download_bytes,
            upload_bytes = user_inbound_usage_history.upload_bytes + EXCLUDED.upload_bytes,
            total_bytes = user_inbound_usage_history.total_bytes + EXCLUDED.total_bytes,
            updated_at = GREATEST(user_inbound_usage_history.updated_at, EXCLUDED.updated_at)
    `);
}

async function getCompactedBefore(prisma: PrismaClient): Promise<Date | null> {
    const [state] = await prisma.$queryRaw<Array<{ compactedBefore: Date | null }>>(Prisma.sql`
        SELECT compacted_before AS "compactedBefore" FROM usage_history_compaction_state WHERE id = 1
    `);
    return state?.compactedBefore ? utcDay(state.compactedBefore) : null;
}

function utcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}
