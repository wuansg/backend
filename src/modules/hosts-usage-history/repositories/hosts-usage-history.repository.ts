import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Prisma } from '@prisma/client';

import { Injectable } from '@nestjs/common';

import { ICrudHistoricalRecords } from '@common/types/crud-port';

import { HostsUsageHistoryEntity } from '../entities';
import { HostsUsageHistoryConverter } from '../hosts-usage-history.converter';
import { IGetHostsUsageByRange, ITopHost, ITopHostUser } from '../interfaces';

export interface IInboundUsageStat {
    inbound: string;
    uplink: number;
    downlink: number;
}

export interface IUserInboundUsageStat extends IInboundUsageStat {
    username: string;
}

@Injectable()
export class HostsUsageHistoryRepository implements ICrudHistoricalRecords<HostsUsageHistoryEntity> {
    constructor(
        private readonly prisma: TransactionHost<TransactionalAdapterPrisma>,
        private readonly converter: HostsUsageHistoryConverter,
    ) {}

    public async create(entity: HostsUsageHistoryEntity): Promise<HostsUsageHistoryEntity> {
        const model = this.converter.fromEntityToPrismaModel(entity);
        const result = await this.prisma.tx.hostsUsageHistory.create({
            data: model,
        });

        return this.converter.fromPrismaModelToEntity(result);
    }

    public async upsertUsageHistory(
        entity: HostsUsageHistoryEntity,
    ): Promise<HostsUsageHistoryEntity> {
        const model = this.converter.fromEntityToPrismaModel(entity);
        const result = await this.prisma.tx.hostsUsageHistory.upsert({
            create: model,
            update: {
                downloadBytes: {
                    increment: model.downloadBytes,
                },
                uploadBytes: {
                    increment: model.uploadBytes,
                },
                totalBytes: {
                    increment: model.totalBytes,
                },
                isShared: model.isShared,
            },
            where: {
                hostUuid_nodeUuid_inboundTag_createdAt: {
                    hostUuid: entity.hostUuid,
                    nodeUuid: entity.nodeUuid,
                    inboundTag: entity.inboundTag,
                    createdAt: entity.createdAt,
                },
            },
        });

        return this.converter.fromPrismaModelToEntity(result);
    }

    public async findByCriteria(
        dto: Partial<HostsUsageHistoryEntity>,
    ): Promise<HostsUsageHistoryEntity[]> {
        const list = await this.prisma.tx.hostsUsageHistory.findMany({
            where: dto,
        });
        return this.converter.fromPrismaModelsToEntities(list);
    }

    public async recordNodeHostUsage(
        nodeUuid: string,
        inbounds: IInboundUsageStat[],
        createdAt: Date,
    ): Promise<void> {
        createdAt.setMinutes(0, 0, 0);

        const inboundStats = new Map<
            string,
            {
                downloadBytes: bigint;
                uploadBytes: bigint;
            }
        >();

        for (const inbound of inbounds) {
            const downloadBytes = BigInt(inbound.downlink || 0);
            const uploadBytes = BigInt(inbound.uplink || 0);
            if (downloadBytes === BigInt(0) && uploadBytes === BigInt(0)) {
                continue;
            }
            inboundStats.set(inbound.inbound, { downloadBytes, uploadBytes });
        }

        if (inboundStats.size === 0) {
            return;
        }

        const hosts = await this.prisma.tx.hosts.findMany({
            where: {
                isDisabled: false,
                configProfileInboundUuid: { not: null },
                nodes: {
                    some: {
                        nodeUuid,
                    },
                },
            },
            select: {
                uuid: true,
                configProfileInbounds: {
                    select: {
                        tag: true,
                    },
                },
            },
        });

        const hostsByInbound = new Map<string, string[]>();
        for (const host of hosts) {
            const tag = host.configProfileInbounds?.tag;
            if (!tag || !inboundStats.has(tag)) {
                continue;
            }
            hostsByInbound.set(tag, [...(hostsByInbound.get(tag) ?? []), host.uuid]);
        }

        for (const [inboundTag, hostUuids] of hostsByInbound) {
            const stat = inboundStats.get(inboundTag);
            if (!stat) {
                continue;
            }

            const totalBytes = stat.downloadBytes + stat.uploadBytes;
            const isShared = hostUuids.length > 1;

            for (const hostUuid of hostUuids) {
                await this.upsertUsageHistory(
                    new HostsUsageHistoryEntity({
                        hostUuid,
                        nodeUuid,
                        inboundTag,
                        downloadBytes: stat.downloadBytes,
                        uploadBytes: stat.uploadBytes,
                        totalBytes,
                        isShared,
                        createdAt: new Date(createdAt),
                    }),
                );
            }
        }
    }

    public async recordNodeUserHostUsage(
        nodeUuid: string,
        userInbounds: IUserInboundUsageStat[],
        createdAt: Date,
    ): Promise<void> {
        createdAt.setMinutes(0, 0, 0);

        const inboundStats = new Map<
            string,
            Array<{
                userId: bigint;
                downloadBytes: bigint;
                uploadBytes: bigint;
            }>
        >();

        for (const inbound of userInbounds) {
            if (!inbound.inbound) {
                continue;
            }

            let userId: bigint;
            try {
                userId = BigInt(inbound.username);
            } catch {
                continue;
            }

            const downloadBytes = BigInt(inbound.downlink || 0);
            const uploadBytes = BigInt(inbound.uplink || 0);
            if (downloadBytes === BigInt(0) && uploadBytes === BigInt(0)) {
                continue;
            }

            const stats = inboundStats.get(inbound.inbound) ?? [];
            stats.push({ userId, downloadBytes, uploadBytes });
            inboundStats.set(inbound.inbound, stats);
        }

        if (inboundStats.size === 0) {
            return;
        }

        const hosts = await this.prisma.tx.hosts.findMany({
            where: {
                isDisabled: false,
                configProfileInboundUuid: { not: null },
                nodes: {
                    some: {
                        nodeUuid,
                    },
                },
            },
            select: {
                uuid: true,
                configProfileInbounds: {
                    select: {
                        tag: true,
                    },
                },
            },
        });

        const hostsByInbound = new Map<string, string[]>();
        for (const host of hosts) {
            const tag = host.configProfileInbounds?.tag;
            if (!tag || !inboundStats.has(tag)) {
                continue;
            }
            hostsByInbound.set(tag, [...(hostsByInbound.get(tag) ?? []), host.uuid]);
        }

        const rows: Prisma.Sql[] = [];
        for (const [inboundTag, hostUuids] of hostsByInbound) {
            const stats = inboundStats.get(inboundTag);
            if (!stats) {
                continue;
            }

            const isShared = hostUuids.length > 1;

            for (const stat of stats) {
                const totalBytes = stat.downloadBytes + stat.uploadBytes;
                for (const hostUuid of hostUuids) {
                    rows.push(Prisma.sql`(
                        ${stat.userId},
                        ${hostUuid}::uuid,
                        ${nodeUuid}::uuid,
                        ${inboundTag},
                        ${stat.downloadBytes},
                        ${stat.uploadBytes},
                        ${totalBytes},
                        ${isShared},
                        ${createdAt}
                    )`);
                }
            }
        }

        if (rows.length === 0) {
            return;
        }

        await this.prisma.tx.$executeRaw(Prisma.sql`
            INSERT INTO user_hosts_usage_history (
                user_id,
                host_uuid,
                node_uuid,
                inbound_tag,
                download_bytes,
                upload_bytes,
                total_bytes,
                is_shared,
                created_at
            )
            VALUES ${Prisma.join(rows)}
            ON CONFLICT ON CONSTRAINT user_hosts_usage_history_pkey
            DO UPDATE SET
                download_bytes = user_hosts_usage_history.download_bytes + EXCLUDED.download_bytes,
                upload_bytes = user_hosts_usage_history.upload_bytes + EXCLUDED.upload_bytes,
                total_bytes = user_hosts_usage_history.total_bytes + EXCLUDED.total_bytes,
                is_shared = EXCLUDED.is_shared,
                updated_at = now();
        `);
    }

    public async getHostsUsageByRange(
        start: Date,
        end: Date,
        dates: string[],
    ): Promise<IGetHostsUsageByRange[]> {
        return await this.getHostsUsageByRangeFiltered(start, end, dates);
    }

    public async getHostsUsageByRangeForHostUuids(
        hostUuids: string[],
        start: Date,
        end: Date,
        dates: string[],
    ): Promise<IGetHostsUsageByRange[]> {
        return await this.getHostsUsageByRangeFiltered(start, end, dates, hostUuids);
    }

    public async getUserHostsUsageByRange(
        userId: bigint,
        start: Date,
        end: Date,
        dates: string[],
    ): Promise<IGetHostsUsageByRange[]> {
        const query = Prisma.sql`
            WITH selected_groups AS (
                SELECT DISTINCT
                    uhuh.node_uuid,
                    uhuh.inbound_tag
                FROM user_hosts_usage_history uhuh
                WHERE
                    uhuh.user_id = ${userId}
                    AND uhuh.created_at >= ${start}
                    AND uhuh.created_at <= ${end}
            ),
            host_rows AS (
                SELECT
                    uhuh.node_uuid,
                    uhuh.inbound_tag,
                    h.uuid,
                    h.remark,
                    h.address,
                    h.port,
                    h.view_position,
                    (h.tags)[1] AS tag,
                    BOOL_OR(uhuh.is_shared) AS is_shared
                FROM user_hosts_usage_history uhuh
                INNER JOIN selected_groups sg
                    ON sg.node_uuid = uhuh.node_uuid
                    AND sg.inbound_tag = uhuh.inbound_tag
                INNER JOIN hosts h ON h.uuid = uhuh.host_uuid
                WHERE
                    uhuh.user_id = ${userId}
                    AND uhuh.created_at >= ${start}
                    AND uhuh.created_at <= ${end}
                GROUP BY
                    uhuh.node_uuid,
                    uhuh.inbound_tag,
                    h.uuid,
                    h.remark,
                    h.address,
                    h.port,
                    h.view_position,
                    h.tags
            ),
            group_hosts AS (
                SELECT
                    node_uuid,
                    inbound_tag,
                    (ARRAY_AGG(uuid ORDER BY view_position, remark))[1] AS uuid,
                    CASE
                        WHEN COUNT(*) > 1 THEN STRING_AGG(remark, ' + ' ORDER BY view_position, remark)
                        ELSE (ARRAY_AGG(remark ORDER BY view_position, remark))[1]
                    END AS remark,
                    (ARRAY_AGG(address ORDER BY view_position, remark))[1] AS address,
                    (ARRAY_AGG(port ORDER BY view_position, remark))[1] AS port,
                    (ARRAY_AGG(tag ORDER BY view_position, remark))[1] AS tag,
                    (BOOL_OR(is_shared) OR COUNT(*) > 1) AS is_shared,
                    JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'uuid', uuid,
                            'remark', remark,
                            'address', address,
                            'port', port
                        )
                        ORDER BY view_position, remark
                    ) AS hosts
                FROM host_rows
                GROUP BY node_uuid, inbound_tag
            ),
            dedup_hourly AS (
                SELECT
                    uhuh.node_uuid,
                    uhuh.inbound_tag,
                    uhuh.created_at,
                    MAX(uhuh.total_bytes) AS total_bytes
                FROM user_hosts_usage_history uhuh
                INNER JOIN selected_groups sg
                    ON sg.node_uuid = uhuh.node_uuid
                    AND sg.inbound_tag = uhuh.inbound_tag
                WHERE
                    uhuh.user_id = ${userId}
                    AND uhuh.created_at >= ${start}
                    AND uhuh.created_at <= ${end}
                GROUP BY uhuh.node_uuid, uhuh.inbound_tag, uhuh.created_at
            ),
            daily_usage AS (
                SELECT
                    node_uuid,
                    inbound_tag,
                    DATE_TRUNC('day', created_at)::date AS date,
                    SUM(total_bytes) AS bytes
                FROM dedup_hourly
                GROUP BY node_uuid, inbound_tag, DATE_TRUNC('day', created_at)
            ),
            groups_with_totals AS (
                SELECT
                    node_uuid,
                    inbound_tag,
                    SUM(bytes) AS total_bytes
                FROM daily_usage
                GROUP BY node_uuid, inbound_tag
            )
            SELECT
                gh.uuid as "uuid",
                gh.node_uuid::text || ':' || gh.inbound_tag as "groupKey",
                gh.node_uuid as "nodeUuid",
                gh.inbound_tag as "inboundTag",
                gh.remark as "remark",
                gh.address as "address",
                gh.port as "port",
                gh.tag as "tag",
                gh.is_shared as "isShared",
                gh.hosts as "hosts",
                gt.total_bytes as "total",
                ARRAY_AGG(
                    COALESCE(du.bytes, 0)
                    ORDER BY d.ord
                ) AS "data"
            FROM groups_with_totals gt
            INNER JOIN group_hosts gh
                ON gh.node_uuid = gt.node_uuid
                AND gh.inbound_tag = gt.inbound_tag
            CROSS JOIN unnest(${dates}::date[]) WITH ORDINALITY AS d(date, ord)
            LEFT JOIN daily_usage du
                ON du.node_uuid = gt.node_uuid
                AND du.inbound_tag = gt.inbound_tag
                AND du.date = d.date
            GROUP BY
                gh.uuid,
                gh.node_uuid,
                gh.inbound_tag,
                gh.remark,
                gh.address,
                gh.port,
                gh.tag,
                gh.is_shared,
                gh.hosts,
                gt.total_bytes
            ORDER BY gt.total_bytes DESC;
        `;

        return await this.prisma.tx.$queryRaw<IGetHostsUsageByRange[]>(query);
    }

    private async getHostsUsageByRangeFiltered(
        start: Date,
        end: Date,
        dates: string[],
        hostUuids?: string[],
    ): Promise<IGetHostsUsageByRange[]> {
        const hostUuidFilter = hostUuids
            ? Prisma.sql`AND huh.host_uuid IN (${Prisma.join(
                  hostUuids.map((hostUuid) => Prisma.sql`${hostUuid}::uuid`),
              )})`
            : Prisma.empty;

        const query = Prisma.sql`
            WITH selected_groups AS (
                SELECT DISTINCT
                    huh.node_uuid,
                    huh.inbound_tag
                FROM hosts_usage_history huh
                WHERE
                    huh.created_at >= ${start}
                    AND huh.created_at <= ${end}
                    ${hostUuidFilter}
            ),
            host_rows AS (
                SELECT
                    huh.node_uuid,
                    huh.inbound_tag,
                    h.uuid,
                    h.remark,
                    h.address,
                    h.port,
                    h.view_position,
                    (h.tags)[1] AS tag,
                    BOOL_OR(huh.is_shared) AS is_shared
                FROM hosts_usage_history huh
                INNER JOIN selected_groups sg
                    ON sg.node_uuid = huh.node_uuid
                    AND sg.inbound_tag = huh.inbound_tag
                INNER JOIN hosts h ON h.uuid = huh.host_uuid
                WHERE
                    huh.created_at >= ${start}
                    AND huh.created_at <= ${end}
                GROUP BY
                    huh.node_uuid,
                    huh.inbound_tag,
                    h.uuid,
                    h.remark,
                    h.address,
                    h.port,
                    h.view_position,
                    h.tags
            ),
            group_hosts AS (
                SELECT
                    node_uuid,
                    inbound_tag,
                    (ARRAY_AGG(uuid ORDER BY view_position, remark))[1] AS uuid,
                    CASE
                        WHEN COUNT(*) > 1 THEN STRING_AGG(remark, ' + ' ORDER BY view_position, remark)
                        ELSE (ARRAY_AGG(remark ORDER BY view_position, remark))[1]
                    END AS remark,
                    (ARRAY_AGG(address ORDER BY view_position, remark))[1] AS address,
                    (ARRAY_AGG(port ORDER BY view_position, remark))[1] AS port,
                    (ARRAY_AGG(tag ORDER BY view_position, remark))[1] AS tag,
                    (BOOL_OR(is_shared) OR COUNT(*) > 1) AS is_shared,
                    JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'uuid', uuid,
                            'remark', remark,
                            'address', address,
                            'port', port
                        )
                        ORDER BY view_position, remark
                    ) AS hosts
                FROM host_rows
                GROUP BY node_uuid, inbound_tag
            ),
            dedup_hourly AS (
                SELECT
                    huh.node_uuid,
                    huh.inbound_tag,
                    huh.created_at,
                    MAX(huh.total_bytes) AS total_bytes
                FROM hosts_usage_history huh
                INNER JOIN selected_groups sg
                    ON sg.node_uuid = huh.node_uuid
                    AND sg.inbound_tag = huh.inbound_tag
                WHERE
                    huh.created_at >= ${start}
                    AND huh.created_at <= ${end}
                GROUP BY huh.node_uuid, huh.inbound_tag, huh.created_at
            ),
            daily_usage AS (
                SELECT
                    node_uuid,
                    inbound_tag,
                    DATE_TRUNC('day', created_at)::date AS date,
                    SUM(total_bytes) AS bytes
                FROM dedup_hourly
                GROUP BY node_uuid, inbound_tag, DATE_TRUNC('day', created_at)
            ),
            groups_with_totals AS (
                SELECT
                    node_uuid,
                    inbound_tag,
                    SUM(bytes) AS total_bytes
                FROM daily_usage
                GROUP BY node_uuid, inbound_tag
            )
            SELECT
                gh.uuid as "uuid",
                gh.node_uuid::text || ':' || gh.inbound_tag as "groupKey",
                gh.node_uuid as "nodeUuid",
                gh.inbound_tag as "inboundTag",
                gh.remark as "remark",
                gh.address as "address",
                gh.port as "port",
                gh.tag as "tag",
                gh.is_shared as "isShared",
                gh.hosts as "hosts",
                gt.total_bytes as "total",
                ARRAY_AGG(
                    COALESCE(du.bytes, 0)
                    ORDER BY d.ord
                ) AS "data"
            FROM groups_with_totals gt
            INNER JOIN group_hosts gh
                ON gh.node_uuid = gt.node_uuid
                AND gh.inbound_tag = gt.inbound_tag
            CROSS JOIN unnest(${dates}::date[]) WITH ORDINALITY AS d(date, ord)
            LEFT JOIN daily_usage du
                ON du.node_uuid = gt.node_uuid
                AND du.inbound_tag = gt.inbound_tag
                AND du.date = d.date
            GROUP BY
                gh.uuid,
                gh.node_uuid,
                gh.inbound_tag,
                gh.remark,
                gh.address,
                gh.port,
                gh.tag,
                gh.is_shared,
                gh.hosts,
                gt.total_bytes
            ORDER BY gt.total_bytes DESC;
        `;

        return await this.prisma.tx.$queryRaw<IGetHostsUsageByRange[]>(query);
    }

    public async getTopHostsByTraffic(
        start: Date,
        end: Date,
        limit: number = 5,
    ): Promise<ITopHost[]> {
        return await this.getTopHostsByTrafficFiltered(start, end, limit);
    }

    public async getTopHostsByTrafficForHostUuids(
        hostUuids: string[],
        start: Date,
        end: Date,
        limit: number = 5,
    ): Promise<ITopHost[]> {
        return await this.getTopHostsByTrafficFiltered(start, end, limit, hostUuids);
    }

    private async getTopHostsByTrafficFiltered(
        start: Date,
        end: Date,
        limit: number = 5,
        hostUuids?: string[],
    ): Promise<ITopHost[]> {
        const hostUuidFilter = hostUuids
            ? Prisma.sql`AND huh.host_uuid IN (${Prisma.join(
                  hostUuids.map((hostUuid) => Prisma.sql`${hostUuid}::uuid`),
              )})`
            : Prisma.empty;

        const query = Prisma.sql`
            WITH selected_groups AS (
                SELECT DISTINCT
                    huh.node_uuid,
                    huh.inbound_tag
                FROM hosts_usage_history huh
                WHERE
                    huh.created_at >= ${start}
                    AND huh.created_at <= ${end}
                    ${hostUuidFilter}
            ),
            host_rows AS (
                SELECT
                    huh.node_uuid,
                    huh.inbound_tag,
                    h.uuid,
                    h.remark,
                    h.address,
                    h.port,
                    h.view_position,
                    (h.tags)[1] AS tag,
                    BOOL_OR(huh.is_shared) AS is_shared
                FROM hosts_usage_history huh
                INNER JOIN selected_groups sg
                    ON sg.node_uuid = huh.node_uuid
                    AND sg.inbound_tag = huh.inbound_tag
                INNER JOIN hosts h ON h.uuid = huh.host_uuid
                WHERE
                    huh.created_at >= ${start}
                    AND huh.created_at <= ${end}
                GROUP BY
                    huh.node_uuid,
                    huh.inbound_tag,
                    h.uuid,
                    h.remark,
                    h.address,
                    h.port,
                    h.view_position,
                    h.tags
            ),
            group_hosts AS (
                SELECT
                    node_uuid,
                    inbound_tag,
                    (ARRAY_AGG(uuid ORDER BY view_position, remark))[1] AS uuid,
                    CASE
                        WHEN COUNT(*) > 1 THEN STRING_AGG(remark, ' + ' ORDER BY view_position, remark)
                        ELSE (ARRAY_AGG(remark ORDER BY view_position, remark))[1]
                    END AS remark,
                    (ARRAY_AGG(address ORDER BY view_position, remark))[1] AS address,
                    (ARRAY_AGG(port ORDER BY view_position, remark))[1] AS port,
                    (ARRAY_AGG(tag ORDER BY view_position, remark))[1] AS tag,
                    (BOOL_OR(is_shared) OR COUNT(*) > 1) AS is_shared,
                    JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'uuid', uuid,
                            'remark', remark,
                            'address', address,
                            'port', port
                        )
                        ORDER BY view_position, remark
                    ) AS hosts
                FROM host_rows
                GROUP BY node_uuid, inbound_tag
            ),
            dedup_hourly AS (
                SELECT
                    huh.node_uuid,
                    huh.inbound_tag,
                    huh.created_at,
                    MAX(huh.total_bytes) AS total_bytes
                FROM hosts_usage_history huh
                INNER JOIN selected_groups sg
                    ON sg.node_uuid = huh.node_uuid
                    AND sg.inbound_tag = huh.inbound_tag
                WHERE
                    huh.created_at >= ${start}
                    AND huh.created_at <= ${end}
                GROUP BY huh.node_uuid, huh.inbound_tag, huh.created_at
            ),
            group_totals AS (
                SELECT
                    node_uuid,
                    inbound_tag,
                    SUM(total_bytes) AS total_bytes
                FROM dedup_hourly
                GROUP BY node_uuid, inbound_tag
            )
            SELECT
                gh.uuid as "uuid",
                gh.node_uuid::text || ':' || gh.inbound_tag as "groupKey",
                gh.node_uuid as "nodeUuid",
                gh.inbound_tag as "inboundTag",
                gh.remark as "remark",
                gh.address as "address",
                gh.port as "port",
                gh.tag as "tag",
                gh.is_shared as "isShared",
                gh.hosts as "hosts",
                gt.total_bytes as "total"
            FROM group_totals gt
            INNER JOIN group_hosts gh
                ON gh.node_uuid = gt.node_uuid
                AND gh.inbound_tag = gt.inbound_tag
            ORDER BY gt.total_bytes DESC
            LIMIT ${limit};
        `;

        return await this.prisma.tx.$queryRaw<ITopHost[]>(query);
    }

    public async getTopUserHostsByTraffic(
        userId: bigint,
        start: Date,
        end: Date,
        limit: number = 5,
    ): Promise<ITopHost[]> {
        const query = Prisma.sql`
            WITH selected_groups AS (
                SELECT DISTINCT
                    uhuh.node_uuid,
                    uhuh.inbound_tag
                FROM user_hosts_usage_history uhuh
                WHERE
                    uhuh.user_id = ${userId}
                    AND uhuh.created_at >= ${start}
                    AND uhuh.created_at <= ${end}
            ),
            host_rows AS (
                SELECT
                    uhuh.node_uuid,
                    uhuh.inbound_tag,
                    h.uuid,
                    h.remark,
                    h.address,
                    h.port,
                    h.view_position,
                    (h.tags)[1] AS tag,
                    BOOL_OR(uhuh.is_shared) AS is_shared
                FROM user_hosts_usage_history uhuh
                INNER JOIN selected_groups sg
                    ON sg.node_uuid = uhuh.node_uuid
                    AND sg.inbound_tag = uhuh.inbound_tag
                INNER JOIN hosts h ON h.uuid = uhuh.host_uuid
                WHERE
                    uhuh.user_id = ${userId}
                    AND uhuh.created_at >= ${start}
                    AND uhuh.created_at <= ${end}
                GROUP BY
                    uhuh.node_uuid,
                    uhuh.inbound_tag,
                    h.uuid,
                    h.remark,
                    h.address,
                    h.port,
                    h.view_position,
                    h.tags
            ),
            group_hosts AS (
                SELECT
                    node_uuid,
                    inbound_tag,
                    (ARRAY_AGG(uuid ORDER BY view_position, remark))[1] AS uuid,
                    CASE
                        WHEN COUNT(*) > 1 THEN STRING_AGG(remark, ' + ' ORDER BY view_position, remark)
                        ELSE (ARRAY_AGG(remark ORDER BY view_position, remark))[1]
                    END AS remark,
                    (ARRAY_AGG(address ORDER BY view_position, remark))[1] AS address,
                    (ARRAY_AGG(port ORDER BY view_position, remark))[1] AS port,
                    (ARRAY_AGG(tag ORDER BY view_position, remark))[1] AS tag,
                    (BOOL_OR(is_shared) OR COUNT(*) > 1) AS is_shared,
                    JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'uuid', uuid,
                            'remark', remark,
                            'address', address,
                            'port', port
                        )
                        ORDER BY view_position, remark
                    ) AS hosts
                FROM host_rows
                GROUP BY node_uuid, inbound_tag
            ),
            dedup_hourly AS (
                SELECT
                    uhuh.node_uuid,
                    uhuh.inbound_tag,
                    uhuh.created_at,
                    MAX(uhuh.total_bytes) AS total_bytes
                FROM user_hosts_usage_history uhuh
                INNER JOIN selected_groups sg
                    ON sg.node_uuid = uhuh.node_uuid
                    AND sg.inbound_tag = uhuh.inbound_tag
                WHERE
                    uhuh.user_id = ${userId}
                    AND uhuh.created_at >= ${start}
                    AND uhuh.created_at <= ${end}
                GROUP BY uhuh.node_uuid, uhuh.inbound_tag, uhuh.created_at
            ),
            group_totals AS (
                SELECT
                    node_uuid,
                    inbound_tag,
                    SUM(total_bytes) AS total_bytes
                FROM dedup_hourly
                GROUP BY node_uuid, inbound_tag
            )
            SELECT
                gh.uuid as "uuid",
                gh.node_uuid::text || ':' || gh.inbound_tag as "groupKey",
                gh.node_uuid as "nodeUuid",
                gh.inbound_tag as "inboundTag",
                gh.remark as "remark",
                gh.address as "address",
                gh.port as "port",
                gh.tag as "tag",
                gh.is_shared as "isShared",
                gh.hosts as "hosts",
                gt.total_bytes as "total"
            FROM group_totals gt
            INNER JOIN group_hosts gh
                ON gh.node_uuid = gt.node_uuid
                AND gh.inbound_tag = gt.inbound_tag
            ORDER BY gt.total_bytes DESC
            LIMIT ${limit};
        `;

        return await this.prisma.tx.$queryRaw<ITopHost[]>(query);
    }

    public async getTopHostUsersByTraffic(
        hostUuid: string,
        start: Date,
        end: Date,
        limit: number = 100,
    ): Promise<ITopHostUser[]> {
        const query = Prisma.sql`
            SELECT
                u.id as "userId",
                u.username as "username",
                SUM(uhuh.total_bytes) as "total"
            FROM users u
            INNER JOIN user_hosts_usage_history uhuh ON uhuh.user_id = u.id
            WHERE
                uhuh.host_uuid = ${hostUuid}::uuid
                AND uhuh.created_at >= ${start}
                AND uhuh.created_at <= ${end}
            GROUP BY u.id, u.username
            ORDER BY SUM(uhuh.total_bytes) DESC
            LIMIT ${limit};
        `;

        return await this.prisma.tx.$queryRaw<ITopHostUser[]>(query);
    }

    public async getDailyTrafficSum(start: Date, end: Date, dates: string[]): Promise<number[]> {
        return await this.getDailyTrafficSumFiltered(start, end, dates);
    }

    public async getDailyTrafficSumForHostUuids(
        hostUuids: string[],
        start: Date,
        end: Date,
        dates: string[],
    ): Promise<number[]> {
        return await this.getDailyTrafficSumFiltered(start, end, dates, hostUuids);
    }

    public async getDailyUserHostsTrafficSum(
        userId: bigint,
        start: Date,
        end: Date,
        dates: string[],
    ): Promise<number[]> {
        const query = Prisma.sql`
            WITH dedup_hourly AS (
                SELECT
                    node_uuid,
                    inbound_tag,
                    created_at,
                    MAX(total_bytes) AS total_bytes
                FROM user_hosts_usage_history
                WHERE
                    user_id = ${userId}
                    AND created_at >= ${start}
                    AND created_at <= ${end}
                GROUP BY node_uuid, inbound_tag, created_at
            ),
            daily_traffic AS (
                SELECT
                    DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date AS date,
                    SUM(total_bytes) AS bytes
                FROM dedup_hourly
                GROUP BY DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')
            )
            SELECT
                COALESCE(dt.bytes, 0) AS value
            FROM unnest(${dates}::date[]) WITH ORDINALITY AS d(date, ord)
            LEFT JOIN daily_traffic dt ON dt.date = d.date
            ORDER BY d.ord;
        `;

        const result = await this.prisma.tx.$queryRaw<Array<{ value: bigint }>>(query);
        return result.map((item) => Number(item.value));
    }

    public async getHostDailyUsersTrafficSum(
        hostUuid: string,
        start: Date,
        end: Date,
        dates: string[],
    ): Promise<number[]> {
        const query = Prisma.sql`
            WITH daily_traffic AS (
                SELECT
                    DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date AS date,
                    SUM(total_bytes) AS bytes
                FROM user_hosts_usage_history
                WHERE
                    host_uuid = ${hostUuid}::uuid
                    AND created_at >= ${start}
                    AND created_at <= ${end}
                GROUP BY DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')
            )
            SELECT
                COALESCE(dt.bytes, 0) AS value
            FROM unnest(${dates}::date[]) WITH ORDINALITY AS d(date, ord)
            LEFT JOIN daily_traffic dt ON dt.date = d.date
            ORDER BY d.ord;
        `;

        const result = await this.prisma.tx.$queryRaw<Array<{ value: bigint }>>(query);
        return result.map((item) => Number(item.value));
    }

    private async getDailyTrafficSumFiltered(
        start: Date,
        end: Date,
        dates: string[],
        hostUuids?: string[],
    ): Promise<number[]> {
        const hostUuidFilter = hostUuids
            ? Prisma.sql`AND host_uuid IN (${Prisma.join(
                  hostUuids.map((hostUuid) => Prisma.sql`${hostUuid}::uuid`),
              )})`
            : Prisma.empty;

        const query = Prisma.sql`
            WITH selected_groups AS (
                SELECT DISTINCT
                    node_uuid,
                    inbound_tag
                FROM hosts_usage_history
                WHERE
                    created_at >= ${start}
                    AND created_at <= ${end}
                    ${hostUuidFilter}
            ),
            dedup_hourly AS (
                SELECT
                    huh.node_uuid,
                    huh.inbound_tag,
                    huh.created_at,
                    MAX(huh.total_bytes) AS total_bytes
                FROM hosts_usage_history huh
                INNER JOIN selected_groups sg
                    ON sg.node_uuid = huh.node_uuid
                    AND sg.inbound_tag = huh.inbound_tag
                WHERE
                    huh.created_at >= ${start}
                    AND huh.created_at <= ${end}
                GROUP BY huh.node_uuid, huh.inbound_tag, huh.created_at
            ),
            daily_traffic AS (
                SELECT
                    DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date AS date,
                    SUM(total_bytes) AS bytes
                FROM dedup_hourly
                GROUP BY DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')
            )
            SELECT
                COALESCE(dt.bytes, 0) AS value
            FROM unnest(${dates}::date[]) WITH ORDINALITY AS d(date, ord)
            LEFT JOIN daily_traffic dt ON dt.date = d.date
            ORDER BY d.ord;
        `;

        const result = await this.prisma.tx.$queryRaw<Array<{ value: bigint }>>(query);
        return result.map((item) => Number(item.value));
    }
}
