import { Prisma } from '@prisma/client';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '@common/database/prisma.service';
import { GetForwardingTopologyCommand } from '@libs/contracts/commands';

import { buildForwardingTopology, TopologyUsageRow } from './forwarding-topology.util';

const inboundSelect = { uuid: true, tag: true, type: true, port: true, network: true } as const;

@Injectable()
export class ForwardingTopologyService {
    constructor(private readonly prisma: PrismaService) {}

    async get(input: unknown) {
        const query = GetForwardingTopologyCommand.RequestQuerySchema.parse(input);
        const now = new Date();
        const start = query.start ?? now.toISOString().slice(0, 10);
        const end = query.end ?? start;
        // One consistent, read-only database snapshot; no agent calls, writes, DNS or probes.
        const [nodes, hosts, forwardingUsage, coreUsage, hostUsage] =
            await this.prisma.$transaction(
                [
                    this.prisma.nodes.findMany({
                        orderBy: [{ viewPosition: 'asc' }, { uuid: 'asc' }],
                        select: {
                            uuid: true,
                            name: true,
                            address: true,
                            countryCode: true,
                            provider: { select: { name: true } },
                            isConnected: true,
                            isDisabled: true,
                            forwardingConfig: true,
                            isTrafficTrackingActive: true,
                            trafficUsedBytes: true,
                            trafficLimitBytes: true,
                            trafficResetDay: true,
                            runtimeInventory: { select: { runtimeStatus: true, reportedAt: true } },
                            networkInventory: { select: { interfaces: true, reportedAt: true } },
                            configState: {
                                select: { requestedSeq: true, processedSeq: true, blocked: true },
                            },
                            usageSnapshotState: {
                                select: {
                                    lastSuccessAt: true,
                                    pending: true,
                                    receivedThrough: true,
                                    appliedThrough: true,
                                    lastError: true,
                                },
                            },
                            configProfileInboundsToNodes: {
                                select: { configProfileInbounds: { select: inboundSelect } },
                            },
                            geocheckHistory: {
                                where: { success: true },
                                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                                take: 1,
                                select: { snapshot: true, createdAt: true, sourceType: true },
                            },
                        },
                    }),
                    this.prisma.hosts.findMany({
                        orderBy: [{ viewPosition: 'asc' }, { uuid: 'asc' }],
                        select: {
                            uuid: true,
                            remark: true,
                            address: true,
                            port: true,
                            isDisabled: true,
                            configProfileInboundUuid: true,
                            configProfileInbounds: { select: inboundSelect },
                            nodes: { select: { nodeUuid: true } },
                        },
                    }),
                    this.prisma.$queryRaw<TopologyUsageRow[]>(Prisma.sql`
                SELECT node_uuid AS "nodeUuid", rule_id AS "ruleId", protocol,
                    SUM(upload_bytes)::text AS upload, SUM(download_bytes)::text AS download,
                    SUM(total_bytes)::text AS total, MAX(created_at) AS "lastRecordedAt"
                FROM node_forwarding_usage_history
                WHERE created_at >= (${start}::date::timestamp AT TIME ZONE 'UTC')
                  AND created_at < ((${end}::date + 1)::timestamp AT TIME ZONE 'UTC')
                  AND protocol IN ('TCP','UDP')
                GROUP BY node_uuid, rule_id, protocol ORDER BY node_uuid, rule_id, protocol`),
                    this.prisma.$queryRaw<TopologyUsageRow[]>(Prisma.sql`
                SELECT node_uuid AS "nodeUuid", SUM(upload_bytes)::text AS upload,
                    SUM(download_bytes)::text AS download, SUM(total_bytes)::text AS total,
                    MAX(created_at) AS "lastRecordedAt"
                FROM nodes_usage_history
                WHERE created_at >= ${start}::date AND created_at < (${end}::date + 1)
                GROUP BY node_uuid ORDER BY node_uuid`),
                    this.prisma.$queryRaw<TopologyUsageRow[]>(Prisma.sql`
                SELECT host_uuid AS "hostUuid", SUM(upload_bytes)::text AS upload,
                    SUM(download_bytes)::text AS download, SUM(total_bytes)::text AS total,
                    MAX(created_at) AS "lastRecordedAt", BOOL_OR(is_shared) AS shared
                FROM hosts_usage_history
                WHERE created_at >= ${start}::date AND created_at < (${end}::date + 1)
                GROUP BY host_uuid ORDER BY host_uuid`),
                ],
                { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
            );
        return buildForwardingTopology({
            nodes,
            hosts,
            forwardingUsage,
            coreUsage,
            hostUsage,
            start,
            end,
            now,
        });
    }
}
