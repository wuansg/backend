import { Prisma } from '@prisma/client';

import { Injectable } from '@nestjs/common';

import { AxiosService, INodeConnectionOpts, UsageSnapshot } from '@common/axios';
import { PrismaService } from '@common/database/prisma.service';

import { buildNodeMetricsFromSnapshots, NodeMetricsPublisher } from './node-metrics.publisher';
import {
    collectSortedUsageUserIds,
    retryDatabaseTransaction,
} from './usage-snapshot-transaction.util';
import {
    buildUsageSnapshotWriteBatch,
    UsageDelta,
    UsageSnapshotWriteBatch,
} from './usage-snapshot-write-batch.util';

type SnapshotStateRow = {
    generation: string;
    receivedThrough: bigint;
    appliedThrough: bigint;
};

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
                const rows = await tx.$queryRaw<InboxRow[]>(Prisma.sql`
                    SELECT generation, sequence, payload
                    FROM node_usage_snapshot_inbox
                    WHERE node_uuid = ${nodeUuid}::uuid AND applied_at IS NULL
                    ORDER BY received_at, sequence
                    LIMIT 500
                    FOR UPDATE
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

                await this.applyWriteBatch(
                    tx,
                    nodeUuid,
                    nodeId,
                    buildUsageSnapshotWriteBatch(snapshots, userMultiplier, nodeMultiplier),
                );

                for (let index = 0; index < rows.length; index++) {
                    const row = rows[index];
                    await tx.$executeRaw(Prisma.sql`
                        UPDATE node_usage_snapshot_inbox SET applied_at = now()
                        WHERE node_uuid = ${nodeUuid}::uuid
                          AND generation = ${row.generation}
                          AND sequence = ${row.sequence}
                    `);
                    await tx.$executeRaw(Prisma.sql`
                        UPDATE node_usage_snapshot_state SET
                            applied_through = CASE WHEN generation = ${row.generation}
                                THEN GREATEST(applied_through, ${row.sequence}) ELSE applied_through END,
                            last_error = NULL,
                            updated_at = now()
                        WHERE node_uuid = ${nodeUuid}::uuid
                    `);
                }
                return snapshots;
            }),
        );

        const metrics = buildNodeMetricsFromSnapshots(nodeUuid, appliedSnapshots);
        if (metrics) this.nodeMetricsPublisher.publish(metrics);
    }

    private async applyWriteBatch(
        tx: Prisma.TransactionClient,
        nodeUuid: string,
        nodeId: bigint,
        batch: UsageSnapshotWriteBatch,
    ): Promise<void> {
        for (const { hour, usage } of batch.nodeHours) {
            const total = usage.uplink + usage.downlink;
            await tx.$executeRaw(Prisma.sql`
                INSERT INTO nodes_usage_history (node_uuid, download_bytes, upload_bytes, total_bytes, created_at)
                VALUES (${nodeUuid}::uuid, ${usage.downlink}, ${usage.uplink}, ${total}, ${hour})
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

        for (const user of batch.users) {
            await tx.$executeRaw(Prisma.sql`
                UPDATE user_traffic SET
                    used_traffic_bytes = used_traffic_bytes + ${user.multipliedTotal},
                    lifetime_used_traffic_bytes = lifetime_used_traffic_bytes + ${user.multipliedTotal},
                    last_connected_node_uuid = CASE
                        WHEN online_at IS NULL OR online_at <= ${user.lastCapturedAt}
                        THEN ${nodeUuid}::uuid ELSE last_connected_node_uuid END,
                    online_at = GREATEST(COALESCE(online_at, ${user.lastCapturedAt}), ${user.lastCapturedAt}),
                    first_connected_at = CASE WHEN first_connected_at IS NULL
                        THEN ${user.firstCapturedAt}
                        ELSE LEAST(first_connected_at, ${user.firstCapturedAt}) END
                WHERE id = ${user.userId}
            `);
        }
        for (const userDay of batch.userDays) {
            await tx.$executeRaw(Prisma.sql`
                INSERT INTO nodes_user_usage_history (node_id, user_id, total_bytes, created_at)
                VALUES (${nodeId}, ${userDay.userId}, ${userDay.total}, ${userDay.day})
                ON CONFLICT (node_id, created_at, user_id) DO UPDATE SET
                    total_bytes = nodes_user_usage_history.total_bytes + EXCLUDED.total_bytes,
                    updated_at = now()
            `);
        }

        for (const host of batch.hosts) {
            await this.applyHostUsage(tx, nodeUuid, host.tag, host.usage, host.hour);
        }
        for (const userHost of batch.userHosts) {
            await this.applyUserHostUsage(
                tx,
                nodeUuid,
                userHost.userId,
                userHost.tag,
                userHost.usage,
                userHost.hour,
            );
        }
    }

    private async applyHostUsage(
        tx: Prisma.TransactionClient,
        nodeUuid: string,
        tag: string,
        usage: UsageDelta,
        hour: Date,
    ) {
        const total = usage.uplink + usage.downlink;
        if (total === 0n) return;
        await tx.$executeRaw(Prisma.sql`
            INSERT INTO hosts_usage_history (
                host_uuid, node_uuid, inbound_tag, download_bytes, upload_bytes,
                total_bytes, is_shared, created_at
            )
            SELECT h.uuid, ${nodeUuid}::uuid, ${tag}, ${usage.downlink}, ${usage.uplink},
                   ${total}, count(*) OVER () > 1, ${hour}
            FROM hosts h
            JOIN hosts_to_nodes htn ON htn.host_uuid = h.uuid AND htn.node_uuid = ${nodeUuid}::uuid
            JOIN config_profile_inbounds cpi ON cpi.uuid = h.config_profile_inbound_uuid
            WHERE NOT h.is_disabled AND cpi.tag = ${tag}
            ORDER BY h.uuid
            ON CONFLICT (host_uuid, node_uuid, inbound_tag, created_at) DO UPDATE SET
                download_bytes = hosts_usage_history.download_bytes + EXCLUDED.download_bytes,
                upload_bytes = hosts_usage_history.upload_bytes + EXCLUDED.upload_bytes,
                total_bytes = hosts_usage_history.total_bytes + EXCLUDED.total_bytes,
                is_shared = EXCLUDED.is_shared, updated_at = now()
        `);
    }

    private async applyUserHostUsage(
        tx: Prisma.TransactionClient,
        nodeUuid: string,
        userId: bigint,
        tag: string,
        usage: UsageDelta,
        hour: Date,
    ) {
        const total = usage.uplink + usage.downlink;
        if (total === 0n) return;
        await tx.$executeRaw(Prisma.sql`
            INSERT INTO user_hosts_usage_history (
                user_id, host_uuid, node_uuid, inbound_tag, download_bytes,
                upload_bytes, total_bytes, is_shared, created_at
            )
            SELECT ${userId}, h.uuid, ${nodeUuid}::uuid, ${tag}, ${usage.downlink},
                   ${usage.uplink}, ${total}, count(*) OVER () > 1, ${hour}
            FROM hosts h
            JOIN hosts_to_nodes htn ON htn.host_uuid = h.uuid AND htn.node_uuid = ${nodeUuid}::uuid
            JOIN config_profile_inbounds cpi ON cpi.uuid = h.config_profile_inbound_uuid
            WHERE NOT h.is_disabled AND cpi.tag = ${tag}
            ORDER BY h.uuid
            ON CONFLICT (user_id, host_uuid, node_uuid, inbound_tag, created_at) DO UPDATE SET
                download_bytes = user_hosts_usage_history.download_bytes + EXCLUDED.download_bytes,
                upload_bytes = user_hosts_usage_history.upload_bytes + EXCLUDED.upload_bytes,
                total_bytes = user_hosts_usage_history.total_bytes + EXCLUDED.total_bytes,
                is_shared = EXCLUDED.is_shared, updated_at = now()
        `);
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
                    .$executeRaw(Prisma.sql`
                        UPDATE node_usage_snapshot_state
                        SET database_retries = database_retries + 1, updated_at = now()
                        WHERE node_uuid = ${nodeUuid}::uuid
                    `)
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
