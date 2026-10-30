import { Prisma } from '@prisma/client';

import { Injectable } from '@nestjs/common';

import { AxiosService, INodeConnectionOpts, UsageSnapshot } from '@common/axios';
import { PrismaService } from '@common/database/prisma.service';
import {
    getLegacyNodeTrafficPeriodStart,
    getNodeTrafficHistoryStart,
} from '@common/utils/node-traffic-period.util';

import { buildNodeMetricsFromSnapshots, NodeMetricsPublisher } from './node-metrics.publisher';
import {
    collectSortedUsageUserIds,
    retryDatabaseTransaction,
} from './usage-snapshot-transaction.util';
import {
    buildUsageSnapshotWriteBatch,
    UsageSnapshotWriteBatch,
} from './usage-snapshot-write-batch.util';

type SnapshotStateRow = {
    generation: string;
    receivedThrough: bigint;
    appliedThrough: bigint;
};

/** Upper bound of stored (compressed) inbox payload applied per transaction. */
const APPLY_MAX_STORED_PAYLOAD_BYTES = 2 * 1024 * 1024;

type InboxRow = {
    generation: string;
    sequence: bigint;
    payload: unknown;
};

@Injectable()
export class UsageSnapshotIngestService {
    constructor(
        private readonly axios: AxiosService,
        private readonly prisma: PrismaService,
        private readonly nodeMetricsPublisher: NodeMetricsPublisher,
    ) {}

    public async isActive(nodeUuid: string): Promise<boolean> {
        const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
            SELECT EXISTS (
                SELECT 1 FROM node_usage_snapshot_state WHERE node_uuid = ${nodeUuid}::uuid
            ) AS "exists"
        `);
        return rows[0]?.exists ?? false;
    }

    public async recordError(nodeUuid: string, error: unknown): Promise<void> {
        const message = error instanceof Error ? error.message : String(error);
        await this.prisma
            .$executeRaw(Prisma.sql`
            UPDATE node_usage_snapshot_state
            SET last_error = ${message.slice(0, 2_000)},
                ingest_failures = ingest_failures + 1,
                updated_at = now()
            WHERE node_uuid = ${nodeUuid}::uuid
        `)
            .catch(() => undefined);
    }

    /** Returns false only when the node does not support usage_snapshot_v1. */
    public async ingest(
        nodeUuid: string,
        nodeId: bigint,
        connectionOpts: INodeConnectionOpts,
        userConsumptionMultiplier: string,
        nodeConsumptionMultiplier: string,
    ): Promise<boolean> {
        const startedAt = Date.now();
        let nodeStatus = await this.axios.getUsageSnapshotStatus(connectionOpts);
        if (nodeStatus === null) return false;

        if (!nodeStatus.active)
            nodeStatus = await this.axios.activateUsageSnapshots(connectionOpts);

        // Finish durable work from an older node generation before accepting a
        // replacement generation with sequence numbers starting at one.
        await this.applyPending(
            nodeUuid,
            nodeId,
            userConsumptionMultiplier,
            nodeConsumptionMultiplier,
        );

        let state = await this.getState(nodeUuid);
        if (!state || state.generation !== nodeStatus.generation) {
            await this.prisma.$executeRaw(Prisma.sql`
                INSERT INTO node_usage_snapshot_state (
                    node_uuid, generation, received_through, applied_through,
                    pending, node_queue_bytes, capturing, last_captured_at, last_error, updated_at
                ) VALUES (
                    ${nodeUuid}::uuid, ${nodeStatus.generation}, 0, 0,
                    ${nodeStatus.pending}, ${BigInt(nodeStatus.bytes)},
                    ${isCapturing(nodeStatus)},
                    ${nodeStatus.lastCapturedAt ? new Date(nodeStatus.lastCapturedAt) : null}, NULL, now()
                )
                ON CONFLICT (node_uuid) DO UPDATE SET
                    generation = EXCLUDED.generation,
                    received_through = 0,
                    applied_through = 0,
                    pending = EXCLUDED.pending,
                    node_queue_bytes = EXCLUDED.node_queue_bytes,
                    capturing = EXCLUDED.capturing,
                    last_captured_at = EXCLUDED.last_captured_at,
                    last_error = NULL,
                    updated_at = now()
            `);
            state = await this.getState(nodeUuid);
        }

        const afterSequence = Number(state?.receivedThrough ?? 0n);
        const pulled = await this.axios.pullUsageSnapshots(
            { afterSequence, limit: 500, maxBytes: 4 << 20 },
            connectionOpts,
        );
        if (pulled.generation !== nodeStatus.generation) {
            throw new Error(`Node ${nodeUuid} changed usage snapshot generation during pull.`);
        }

        let receivedThrough = afterSequence;
        if (pulled.snapshots.length > 0) {
            receivedThrough = await this.persistInbox(
                nodeUuid,
                pulled.generation,
                afterSequence,
                pulled.snapshots,
                nodeStatus,
            );
            // ACK only after the inbox and received watermark commit. A lost ACK
            // is harmless because both insert and ACK are idempotent.
            nodeStatus = await this.axios.ackUsageSnapshots(
                { generation: pulled.generation, throughSequence: receivedThrough },
                connectionOpts,
            );
        }

        await this.applyPending(
            nodeUuid,
            nodeId,
            userConsumptionMultiplier,
            nodeConsumptionMultiplier,
        );
        await this.updateNodeStatus(nodeUuid, nodeStatus);
        await this.recordSuccess(nodeUuid, Date.now() - startedAt);
        return true;
    }

    private async getState(nodeUuid: string): Promise<SnapshotStateRow | null> {
        const rows = await this.prisma.$queryRaw<SnapshotStateRow[]>(Prisma.sql`
            SELECT generation,
                   received_through AS "receivedThrough",
                   applied_through AS "appliedThrough"
            FROM node_usage_snapshot_state
            WHERE node_uuid = ${nodeUuid}::uuid
        `);
        return rows[0] ?? null;
    }

    private async persistInbox(
        nodeUuid: string,
        generation: string,
        currentThrough: number,
        snapshots: UsageSnapshot[],
        nodeStatus: {
            active: boolean;
            capturing?: boolean;
            pending: number;
            bytes: number;
            lastCapturedAt?: string;
        },
    ): Promise<number> {
        const ordered = [...snapshots].sort((a, b) => a.sequence - b.sequence);
        let through = currentThrough;
        for (const snapshot of ordered) {
            if (snapshot.sequence !== through + 1) {
                throw new Error(
                    `Usage snapshot gap for ${nodeUuid}: expected ${through + 1}, got ${snapshot.sequence}.`,
                );
            }
            through = snapshot.sequence;
        }

        await this.retryTransaction(nodeUuid, () =>
            this.prisma.$transaction(async (tx) => {
                for (const snapshot of ordered) {
                    await tx.$executeRaw(Prisma.sql`
                        INSERT INTO node_usage_snapshot_inbox (
                            node_uuid, generation, sequence, captured_at, core, payload
                        ) VALUES (
                            ${nodeUuid}::uuid, ${generation}, ${BigInt(snapshot.sequence)},
                            ${new Date(snapshot.capturedAt)}, ${snapshot.core},
                            ${JSON.stringify(snapshot)}::jsonb
                        ) ON CONFLICT DO NOTHING
                    `);
                }
                await tx.$executeRaw(Prisma.sql`
                    UPDATE node_usage_snapshot_state SET
                        received_through = GREATEST(received_through, ${BigInt(through)}),
                        pending = ${nodeStatus.pending},
                        node_queue_bytes = ${BigInt(nodeStatus.bytes)},
                        capturing = ${isCapturing(nodeStatus)},
                        last_captured_at = ${nodeStatus.lastCapturedAt ? new Date(nodeStatus.lastCapturedAt) : null},
                        last_error = NULL,
                        updated_at = now()
                    WHERE node_uuid = ${nodeUuid}::uuid AND generation = ${generation}
                `);
            }),
        );
        return through;
    }

    private async applyPending(
        nodeUuid: string,
        nodeId: bigint,
        userMultiplier: string,
        nodeMultiplier: string,
    ): Promise<void> {
        const appliedSnapshots = await this.retryTransaction(nodeUuid, () =>
            this.prisma.$transaction(async (tx) => {
                // This row is the per-node ingestion mutex. It prevents two
                // workers from applying the same node inbox concurrently.
                await tx.$queryRaw(Prisma.sql`
                    SELECT node_uuid FROM node_usage_snapshot_state
                    WHERE node_uuid = ${nodeUuid}::uuid
                    FOR UPDATE
                `);
                // Loading and aggregating payloads dominates this transaction,
                // so a backlog is applied in slices bounded by stored payload
                // size. The first row is always taken so a large one still
                // makes progress.
                const rows = await tx.$queryRaw<InboxRow[]>(Prisma.sql`
                    WITH candidates AS (
                        SELECT generation, sequence, received_at,
                               pg_column_size(payload) AS stored_bytes
                        FROM node_usage_snapshot_inbox
                        WHERE node_uuid = ${nodeUuid}::uuid AND applied_at IS NULL
                        ORDER BY received_at, sequence
                        LIMIT 500
                    ), bounded AS (
                        SELECT generation, sequence, received_at,
                               sum(stored_bytes) OVER (ORDER BY received_at, sequence)
                                   - stored_bytes AS bytes_before
                        FROM candidates
                    )
                    SELECT inbox.generation, inbox.sequence, inbox.payload
                    FROM node_usage_snapshot_inbox AS inbox
                    JOIN bounded
                      ON bounded.generation = inbox.generation
                     AND bounded.sequence = inbox.sequence
                    WHERE inbox.node_uuid = ${nodeUuid}::uuid
                      AND (bounded.bytes_before = 0
                           OR bounded.bytes_before < ${APPLY_MAX_STORED_PAYLOAD_BYTES})
                    ORDER BY bounded.received_at, bounded.sequence
                    FOR UPDATE OF inbox
                `);
                const snapshots = rows.map((row) => row.payload as UsageSnapshot);
                const userIds = collectSortedUsageUserIds(snapshots);
                if (userIds.length > 0) {
                    // Cross-node transactions share user_traffic rows. Lock
                    // every row up front in one stable order to avoid 40P01.
                    await tx.$queryRaw(Prisma.sql`
                        SELECT id FROM user_traffic
                        WHERE id IN (${Prisma.join(userIds)})
                        ORDER BY id
                        FOR UPDATE
                    `);
                }

                const nodeTrafficPeriodStart = await this.initializeNodeTrafficPeriod(
                    tx,
                    nodeUuid,
                    nodeMultiplier,
                );
                await this.applyWriteBatch(
                    tx,
                    nodeUuid,
                    nodeId,
                    buildUsageSnapshotWriteBatch(
                        snapshots,
                        userMultiplier,
                        nodeMultiplier,
                        nodeTrafficPeriodStart,
                    ),
                );

                if (rows.length > 0) {
                    await this.markInboxApplied(tx, nodeUuid, rows);
                }
                return snapshots;
            }),
        );

        const metrics = buildNodeMetricsFromSnapshots(nodeUuid, appliedSnapshots);
        if (metrics) this.nodeMetricsPublisher.publish(metrics);
    }

    private async initializeNodeTrafficPeriod(
        tx: Prisma.TransactionClient,
        nodeUuid: string,
        nodeMultiplier: string,
    ): Promise<Date> {
        // Serialize quota writes with manual/scheduled resets. Existing nodes
        // have NULL until this one-time, transactional forwarding backfill.
        const [node] = await tx.$queryRaw<
            Array<{
                createdAt: Date;
                isTrafficTrackingActive: boolean;
                trafficResetDay: number | null;
                trafficUsageStartedAt: Date | null;
            }>
        >(Prisma.sql`
            SELECT created_at AS "createdAt",
                   is_traffic_tracking_active AS "isTrafficTrackingActive",
                   traffic_reset_day AS "trafficResetDay",
                   traffic_usage_started_at AS "trafficUsageStartedAt"
            FROM nodes WHERE uuid = ${nodeUuid}::uuid FOR UPDATE
        `);
        if (!node) throw new Error(`Node ${nodeUuid} no longer exists.`);
        if (node.trafficUsageStartedAt) return node.trafficUsageStartedAt;

        const periodStart = getLegacyNodeTrafficPeriodStart(node);
        const [history] = await tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
            SELECT COALESCE(SUM(total_bytes), 0)::bigint AS total
            FROM node_forwarding_usage_history
            WHERE node_uuid = ${nodeUuid}::uuid
              AND created_at >= ${getNodeTrafficHistoryStart(periodStart)}
        `);
        const backfill = (history.total * BigInt(nodeMultiplier)) / 1_000_000_000n;
        await tx.$executeRaw(Prisma.sql`
            UPDATE nodes
            SET traffic_used_bytes = COALESCE(traffic_used_bytes, 0) + ${backfill},
                traffic_usage_started_at = ${periodStart}
            WHERE uuid = ${nodeUuid}::uuid AND traffic_usage_started_at IS NULL
        `);
        return periodStart;
    }

    private async markInboxApplied(
        tx: Prisma.TransactionClient,
        nodeUuid: string,
        rows: InboxRow[],
    ): Promise<void> {
        const generations = rows.map((row) => row.generation);
        const sequences = rows.map((row) => row.sequence.toString());
        await tx.$executeRaw(Prisma.sql`
            UPDATE node_usage_snapshot_inbox AS inbox SET applied_at = now()
            FROM unnest(${generations}::text[], ${sequences}::bigint[]) AS applied(generation, sequence)
            WHERE inbox.node_uuid = ${nodeUuid}::uuid
              AND inbox.generation = applied.generation
              AND inbox.sequence = applied.sequence
        `);
        await tx.$executeRaw(Prisma.sql`
            UPDATE node_usage_snapshot_state AS state SET
                applied_through = GREATEST(state.applied_through, COALESCE((
                    SELECT max(applied.sequence)
                    FROM unnest(${generations}::text[], ${sequences}::bigint[]) AS applied(generation, sequence)
                    WHERE applied.generation = state.generation
                ), state.applied_through)),
                last_error = NULL,
                updated_at = now()
            WHERE state.node_uuid = ${nodeUuid}::uuid
        `);
    }

    /**
     * One statement per target table. Every list in the batch is already
     * unique per conflict key, which ON CONFLICT DO UPDATE requires. Times are
     * bound as ISO strings and converted explicitly: usage history stores UTC
     * in timestamp/date columns, and an implicit timestamptz cast would use
     * the database session time zone.
     */
    private async applyWriteBatch(
        tx: Prisma.TransactionClient,
        nodeUuid: string,
        nodeId: bigint,
        batch: UsageSnapshotWriteBatch,
    ): Promise<void> {
        if (batch.nodeHours.length > 0) {
            await tx.$executeRaw(Prisma.sql`
                INSERT INTO nodes_usage_history (node_uuid, download_bytes, upload_bytes, total_bytes, created_at)
                SELECT ${nodeUuid}::uuid, b.download, b.upload, b.upload + b.download,
                       b.hour::timestamptz AT TIME ZONE 'UTC'
                FROM unnest(
                    ${batch.nodeHours.map((item) => item.hour.toISOString())}::text[],
                    ${batch.nodeHours.map((item) => item.usage.uplink.toString())}::bigint[],
                    ${batch.nodeHours.map((item) => item.usage.downlink.toString())}::bigint[]
                ) AS b(hour, upload, download)
                ON CONFLICT (node_uuid, created_at) DO UPDATE SET
                    download_bytes = nodes_usage_history.download_bytes + EXCLUDED.download_bytes,
                    upload_bytes = nodes_usage_history.upload_bytes + EXCLUDED.upload_bytes,
                    total_bytes = nodes_usage_history.total_bytes + EXCLUDED.total_bytes,
                    updated_at = now()
            `);
        }
        if (batch.nodeMultipliedTotal > 0n) {
            await tx.$executeRaw(Prisma.sql`
                UPDATE nodes SET traffic_used_bytes = COALESCE(traffic_used_bytes, 0) +
                    ${batch.nodeMultipliedTotal}
                WHERE uuid = ${nodeUuid}::uuid
            `);
        }

        if (batch.users.length > 0) {
            await tx.$executeRaw(Prisma.sql`
                UPDATE user_traffic AS ut SET
                    used_traffic_bytes = ut.used_traffic_bytes + b.total,
                    lifetime_used_traffic_bytes = ut.lifetime_used_traffic_bytes + b.total,
                    used_upload_traffic_bytes = ut.used_upload_traffic_bytes + b.upload,
                    used_download_traffic_bytes = ut.used_download_traffic_bytes + b.download,
                    lifetime_upload_traffic_bytes = ut.lifetime_upload_traffic_bytes + b.upload,
                    lifetime_download_traffic_bytes = ut.lifetime_download_traffic_bytes + b.download,
                    last_connected_node_uuid = CASE
                        WHEN ut.online_at IS NULL OR ut.online_at <= b.last_at
                        THEN ${nodeUuid}::uuid ELSE ut.last_connected_node_uuid END,
                    online_at = GREATEST(COALESCE(ut.online_at, b.last_at), b.last_at),
                    first_connected_at = CASE WHEN ut.first_connected_at IS NULL
                        THEN b.first_at
                        ELSE LEAST(ut.first_connected_at, b.first_at) END
                FROM (
                    SELECT id, total, upload, download,
                           first_at::timestamptz AT TIME ZONE 'UTC' AS first_at,
                           last_at::timestamptz AT TIME ZONE 'UTC' AS last_at
                    FROM unnest(
                        ${batch.users.map((user) => user.userId.toString())}::bigint[],
                        ${batch.users.map((user) => user.multipliedTotal.toString())}::bigint[],
                        ${batch.users.map((user) => user.multipliedUpload.toString())}::bigint[],
                        ${batch.users.map((user) => user.multipliedDownload.toString())}::bigint[],
                        ${batch.users.map((user) => user.firstCapturedAt.toISOString())}::text[],
                        ${batch.users.map((user) => user.lastCapturedAt.toISOString())}::text[]
                    ) AS input(id, total, upload, download, first_at, last_at)
                ) AS b
                WHERE ut.id = b.id
            `);
        }
        if (batch.userDays.length > 0) {
            // Users deleted after the node sampled them would violate the FK
            // and poison this node's inbox; their history is cascaded away anyway.
            await tx.$executeRaw(Prisma.sql`
                INSERT INTO nodes_user_usage_history (
                    node_id, user_id, upload_bytes, download_bytes, total_bytes, created_at
                )
                SELECT ${nodeId}, b.user_id, b.upload, b.download, b.upload + b.download, b.day
                FROM unnest(
                    ${batch.userDays.map((item) => item.userId.toString())}::bigint[],
                    ${batch.userDays.map((item) => item.day.toISOString().slice(0, 10))}::date[],
                    ${batch.userDays.map((item) => item.upload.toString())}::bigint[],
                    ${batch.userDays.map((item) => item.download.toString())}::bigint[]
                ) AS b(user_id, day, upload, download)
                WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = b.user_id)
                ON CONFLICT (node_id, created_at, user_id) DO UPDATE SET
                    upload_bytes = nodes_user_usage_history.upload_bytes + EXCLUDED.upload_bytes,
                    download_bytes = nodes_user_usage_history.download_bytes + EXCLUDED.download_bytes,
                    total_bytes = nodes_user_usage_history.total_bytes + EXCLUDED.total_bytes,
                    updated_at = now()
            `);
        }

        const userHosts = batch.userHosts.filter(
            (userHost) => userHost.usage.uplink + userHost.usage.downlink > 0n,
        );
        const hosts = withHostRowsForUserUsage(
            batch.hosts.filter((host) => host.usage.uplink + host.usage.downlink > 0n),
            userHosts,
        );
        if (hosts.length > 0) {
            await tx.$executeRaw(Prisma.sql`
                WITH mapped AS (${this.hostsByInboundSql(nodeUuid)})
                INSERT INTO hosts_usage_history (
                    host_uuid, node_uuid, inbound_tag, download_bytes, upload_bytes,
                    total_bytes, is_shared, created_at
                )
                SELECT m.host_uuid, ${nodeUuid}::uuid, b.tag, b.download, b.upload,
                       b.upload + b.download, m.is_shared, b.hour::timestamptz AT TIME ZONE 'UTC'
                FROM unnest(
                    ${hosts.map((host) => host.tag)}::text[],
                    ${hosts.map((host) => host.hour.toISOString())}::text[],
                    ${hosts.map((host) => host.usage.uplink.toString())}::bigint[],
                    ${hosts.map((host) => host.usage.downlink.toString())}::bigint[]
                ) AS b(tag, hour, upload, download)
                JOIN mapped m ON m.tag = b.tag
                ORDER BY m.host_uuid, b.tag, b.hour
                ON CONFLICT (host_uuid, node_uuid, inbound_tag, created_at) DO UPDATE SET
                    download_bytes = hosts_usage_history.download_bytes + EXCLUDED.download_bytes,
                    upload_bytes = hosts_usage_history.upload_bytes + EXCLUDED.upload_bytes,
                    total_bytes = hosts_usage_history.total_bytes + EXCLUDED.total_bytes,
                    is_shared = EXCLUDED.is_shared, updated_at = now()
            `);
        }

        if (userHosts.length > 0) {
            // One row per inbound; user_hosts_usage_history (a view) fans it
            // out to the Hosts recorded for the same inbound and hour above.
            await tx.$executeRaw(Prisma.sql`
                WITH mapped AS (${this.hostsByInboundSql(nodeUuid)})
                INSERT INTO user_inbound_usage_history (
                    user_id, node_uuid, inbound_tag, download_bytes,
                    upload_bytes, total_bytes, created_at
                )
                SELECT b.user_id, ${nodeUuid}::uuid, b.tag, b.download,
                       b.upload, b.upload + b.download,
                       b.hour::timestamptz AT TIME ZONE 'UTC'
                FROM unnest(
                    ${userHosts.map((userHost) => userHost.userId.toString())}::bigint[],
                    ${userHosts.map((userHost) => userHost.tag)}::text[],
                    ${userHosts.map((userHost) => userHost.hour.toISOString())}::text[],
                    ${userHosts.map((userHost) => userHost.usage.uplink.toString())}::bigint[],
                    ${userHosts.map((userHost) => userHost.usage.downlink.toString())}::bigint[]
                ) AS b(user_id, tag, hour, upload, download)
                WHERE EXISTS (SELECT 1 FROM mapped m WHERE m.tag = b.tag)
                  AND EXISTS (SELECT 1 FROM users u WHERE u.id = b.user_id)
                ORDER BY b.user_id, b.tag, b.hour
                ON CONFLICT (user_id, node_uuid, inbound_tag, created_at) DO UPDATE SET
                    download_bytes = user_inbound_usage_history.download_bytes + EXCLUDED.download_bytes,
                    upload_bytes = user_inbound_usage_history.upload_bytes + EXCLUDED.upload_bytes,
                    total_bytes = user_inbound_usage_history.total_bytes + EXCLUDED.total_bytes,
                    updated_at = now()
            `);
        }

        const forwardingRules = batch.forwardingRules.filter(
            (rule) => rule.usage.uplink + rule.usage.downlink > 0n,
        );
        if (forwardingRules.length > 0) {
            await tx.$executeRaw(Prisma.sql`
                INSERT INTO node_forwarding_usage_history (
                    node_uuid, rule_id, protocol, upload_bytes, download_bytes,
                    total_bytes, created_at
                )
                SELECT ${nodeUuid}::uuid, b.rule_id, b.protocol, b.upload, b.download,
                       b.upload + b.download, b.hour
                FROM unnest(
                    ${forwardingRules.map((rule) => rule.ruleId)}::uuid[],
                    ${forwardingRules.map((rule) => rule.protocol)}::text[],
                    ${forwardingRules.map((rule) => rule.hour.toISOString())}::timestamptz[],
                    ${forwardingRules.map((rule) => rule.usage.uplink.toString())}::bigint[],
                    ${forwardingRules.map((rule) => rule.usage.downlink.toString())}::bigint[]
                ) AS b(rule_id, protocol, hour, upload, download)
                ON CONFLICT (node_uuid, rule_id, protocol, created_at) DO UPDATE SET
                    upload_bytes = node_forwarding_usage_history.upload_bytes + EXCLUDED.upload_bytes,
                    download_bytes = node_forwarding_usage_history.download_bytes + EXCLUDED.download_bytes,
                    total_bytes = node_forwarding_usage_history.total_bytes + EXCLUDED.total_bytes,
                    updated_at = now()
            `);
        }
    }

    /** Enabled Hosts on this node per inbound tag, with the shared-inbound flag. */
    private hostsByInboundSql(nodeUuid: string): Prisma.Sql {
        return Prisma.sql`
            SELECT h.uuid AS host_uuid, cpi.tag,
                   count(*) OVER (PARTITION BY cpi.tag) > 1 AS is_shared
            FROM hosts h
            JOIN hosts_to_nodes htn ON htn.host_uuid = h.uuid AND htn.node_uuid = ${nodeUuid}::uuid
            JOIN config_profile_inbounds cpi ON cpi.uuid = h.config_profile_inbound_uuid
            WHERE NOT h.is_disabled
        `;
    }

    private async updateNodeStatus(
        nodeUuid: string,
        status: {
            active: boolean;
            capturing?: boolean;
            pending: number;
            bytes: number;
            lastCapturedAt?: string;
        },
    ) {
        await this.prisma.$executeRaw(Prisma.sql`
            UPDATE node_usage_snapshot_state SET
                pending = ${status.pending}, node_queue_bytes = ${BigInt(status.bytes)},
                capturing = ${isCapturing(status)},
                last_captured_at = ${status.lastCapturedAt ? new Date(status.lastCapturedAt) : null},
                last_error = NULL, updated_at = now()
            WHERE node_uuid = ${nodeUuid}::uuid
        `);
    }

    private async retryTransaction<T>(nodeUuid: string, operation: () => Promise<T>): Promise<T> {
        return retryDatabaseTransaction(operation, {
            onRetry: async () => {
                await this.prisma
                    .$executeRaw(
                        Prisma.sql`
                        UPDATE node_usage_snapshot_state
                        SET database_retries = database_retries + 1, updated_at = now()
                        WHERE node_uuid = ${nodeUuid}::uuid
                    `,
                    )
                    .catch(() => undefined);
            },
        });
    }

    private async recordSuccess(nodeUuid: string, durationMs: number): Promise<void> {
        await this.prisma.$executeRaw(Prisma.sql`
            UPDATE node_usage_snapshot_state SET
                ingest_successes = ingest_successes + 1,
                last_success_at = now(),
                last_duration_ms = ${Math.max(0, Math.round(durationMs))},
                last_error = NULL,
                updated_at = now()
            WHERE node_uuid = ${nodeUuid}::uuid
        `);
    }
}

function isCapturing(status: { active: boolean; capturing?: boolean }): boolean {
    return status.capturing ?? status.active;
}

/**
 * user_hosts_usage_history joins user usage to Host rows of the same inbound
 * and hour, so every (inbound, hour) with user usage needs a Host row even if
 * its inbound counter stayed at zero. Zero-byte rows do not change any sum.
 */
function withHostRowsForUserUsage(
    hosts: UsageSnapshotWriteBatch['hosts'],
    userHosts: UsageSnapshotWriteBatch['userHosts'],
): UsageSnapshotWriteBatch['hosts'] {
    const keys = new Set(hosts.map((host) => `${host.tag}\u0000${host.hour.toISOString()}`));
    const result = [...hosts];
    for (const userHost of userHosts) {
        const key = `${userHost.tag}\u0000${userHost.hour.toISOString()}`;
        if (keys.has(key)) continue;
        keys.add(key);
        result.push({
            tag: userHost.tag,
            hour: userHost.hour,
            usage: { uplink: 0n, downlink: 0n },
        });
    }
    return result;
}
