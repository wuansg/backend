import { Prisma } from '@prisma/client';

import { Injectable } from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config';
import { PrismaService } from '@common/database/prisma.service';
import { getUtcUsageDateSql, getUtcUsageTimestampSql } from '@common/utils/utc-usage-range.util';

import { DailyTrafficNode, DailyTrafficSummary, DailyTrafficUsage } from './daily-traffic.util';

@Injectable()
export class DailyTrafficCollector {
    constructor(
        private readonly db: PrismaService,
        private readonly config: TypedConfigService,
    ) {}

    async collect(date: Date, now = new Date()): Promise<DailyTrafficSummary> {
        const end = new Date(date.getTime() + 86_400_000);
        const startSql = getUtcUsageTimestampSql(date);
        const endSql = getUtcUsageTimestampSql(end);
        const limit = this.config.get('TELEGRAM_DAILY_TRAFFIC_TOP_N');
        return this.db.$transaction(
            async (tx) => {
                const [nodes] = await tx.$queryRaw<DailyTrafficUsage[]>`
                SELECT COALESCE(SUM(upload_bytes),0)::bigint AS upload,
                       COALESCE(SUM(download_bytes),0)::bigint AS download,
                       COALESCE(SUM(total_bytes),0)::bigint AS total
                FROM nodes_usage_history WHERE created_at >= ${startSql} AND created_at < ${endSql}`;
                const [users] = await tx.$queryRaw<
                    Array<DailyTrafficUsage & { activeUsers: number }>
                >`
                SELECT COALESCE(SUM(upload_bytes),0)::bigint AS upload,
                       COALESCE(SUM(download_bytes),0)::bigint AS download,
                       COALESCE(SUM(total_bytes),0)::bigint AS total,
                       COUNT(DISTINCT user_id) FILTER (WHERE total_bytes > 0)::int AS "activeUsers"
                FROM nodes_user_usage_history WHERE created_at = ${getUtcUsageDateSql(date)}`;
                const [hosts] = await tx.$queryRaw<DailyTrafficUsage[]>`
                SELECT COALESCE(SUM(upload),0)::bigint AS upload,
                       COALESCE(SUM(download),0)::bigint AS download,
                       COALESCE(SUM(total),0)::bigint AS total FROM (
                    SELECT MAX(upload_bytes) AS upload, MAX(download_bytes) AS download,
                           MAX(total_bytes) AS total FROM hosts_usage_history
                    WHERE created_at >= ${startSql} AND created_at < ${endSql}
                    GROUP BY node_uuid, inbound_tag, created_at
                ) dedup`;
                const [forwarding] = await tx.$queryRaw<DailyTrafficUsage[]>`
                SELECT COALESCE(SUM(upload_bytes),0)::bigint AS upload,
                       COALESCE(SUM(download_bytes),0)::bigint AS download,
                       COALESCE(SUM(total_bytes),0)::bigint AS total
                FROM node_forwarding_usage_history
                WHERE created_at >= ${date}::timestamptz AND created_at < ${end}::timestamptz`;
                const topNodes = await this.topNodes(tx, startSql, endSql, limit, 'total_bytes');
                const topUploadNodes = await this.topNodes(
                    tx,
                    startSql,
                    endSql,
                    Math.min(limit, 3),
                    'upload_bytes',
                );
                const topForwardingNodes = await tx.$queryRaw<DailyTrafficNode[]>`
                SELECT n.uuid, n.name, SUM(h.upload_bytes)::bigint AS upload,
                       SUM(h.download_bytes)::bigint AS download, SUM(h.total_bytes)::bigint AS total
                FROM node_forwarding_usage_history h JOIN nodes n ON n.uuid = h.node_uuid
                WHERE h.created_at >= ${date}::timestamptz AND h.created_at < ${end}::timestamptz
                GROUP BY n.uuid, n.name HAVING SUM(h.total_bytes) > 0
                ORDER BY SUM(h.total_bytes) DESC, n.uuid LIMIT ${Math.min(limit, 3)}`;
                const [health] = await tx.$queryRaw<DailyTrafficSummary['health'][]>`
                SELECT COUNT(*)::int AS enabled,
                    COUNT(*) FILTER (WHERE n.is_connected)::int AS connected,
                    COALESCE(SUM(s.pending),0)::int AS pending,
                    COUNT(*) FILTER (WHERE s.last_error IS NOT NULL)::int AS errors,
                    COUNT(*) FILTER (WHERE s.last_success_at IS NULL OR s.last_success_at < ${getUtcUsageTimestampSql(new Date(now.getTime() - 900_000))})::int AS stale
                FROM nodes n LEFT JOIN node_usage_snapshot_state s ON n.uuid = s.node_uuid
                WHERE NOT n.is_disabled`;
                return {
                    nodes,
                    users,
                    hosts,
                    forwarding,
                    topNodes,
                    topUploadNodes,
                    topForwardingNodes,
                    health,
                    userRecordsDisabled: this.config.get('SERVICE_DISABLE_USER_USAGE_RECORDS'),
                };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 },
        );
    }

    private topNodes(
        tx: Prisma.TransactionClient,
        start: Prisma.Sql,
        end: Prisma.Sql,
        limit: number,
        direction: 'total_bytes' | 'upload_bytes',
    ) {
        return tx.$queryRaw<DailyTrafficNode[]>(Prisma.sql`
            SELECT n.uuid, n.name, SUM(h.upload_bytes)::bigint AS upload,
                   SUM(h.download_bytes)::bigint AS download, SUM(h.total_bytes)::bigint AS total
            FROM nodes_usage_history h JOIN nodes n ON n.uuid = h.node_uuid
            WHERE h.created_at >= ${start} AND h.created_at < ${end}
            GROUP BY n.uuid, n.name HAVING SUM(h.${Prisma.raw(direction)}) > 0
            ORDER BY SUM(h.${Prisma.raw(direction)}) DESC, n.uuid LIMIT ${limit}`);
    }
}
