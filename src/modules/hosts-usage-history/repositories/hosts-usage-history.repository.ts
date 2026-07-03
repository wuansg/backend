import { Prisma } from '@prisma/client';

import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';

import { TxKyselyService } from '@common/database/tx-kysely.service';
import { ICrudHistoricalRecords } from '@common/types/crud-port';
import { getKyselyUuid } from '@common/helpers/kysely';

import { HostsUsageHistoryConverter } from '../hosts-usage-history.converter';
import { IGetHostsUsageByRange, ITopHost } from '../interfaces';
import { HostsUsageHistoryEntity } from '../entities';

export interface IInboundUsageStat {
    inbound: string;
    uplink: number;
    downlink: number;
}

@Injectable()
export class HostsUsageHistoryRepository implements ICrudHistoricalRecords<HostsUsageHistoryEntity> {
    constructor(
        private readonly prisma: TransactionHost<TransactionalAdapterPrisma>,
        private readonly qb: TxKyselyService,
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

    private async getHostsUsageByRangeFiltered(
        start: Date,
        end: Date,
        dates: string[],
        hostUuids?: string[],
    ): Promise<IGetHostsUsageByRange[]> {
        const hostUuidFilter = hostUuids
            ? Prisma.sql`AND h.uuid IN (${Prisma.join(
                  hostUuids.map((hostUuid) => Prisma.sql`${hostUuid}::uuid`),
              )})`
            : Prisma.empty;

        const query = Prisma.sql`
            WITH daily_usage AS (
                SELECT
                    h.uuid,
                    h.remark,
                    h.address,
                    h.port,
                    h.tag,
                    BOOL_OR(huh.is_shared) AS is_shared,
                    DATE_TRUNC('day', huh.created_at)::date AS date,
                    SUM(huh.total_bytes) AS bytes
                FROM hosts h
                INNER JOIN hosts_usage_history huh ON huh.host_uuid = h.uuid
                WHERE
                    huh.created_at >= ${start}
                    AND huh.created_at <= ${end}
                    ${hostUuidFilter}
                GROUP BY h.uuid, h.remark, h.address, h.port, h.tag, DATE_TRUNC('day', huh.created_at)
            ),
            hosts_with_totals AS (
                SELECT
                    uuid,
                    remark,
                    address,
                    port,
                    tag,
                    BOOL_OR(is_shared) AS is_shared,
                    SUM(bytes) AS total_bytes
                FROM daily_usage
                GROUP BY uuid, remark, address, port, tag
            )
            SELECT
                ht.uuid as "uuid",
                ht.remark as "remark",
                ht.address as "address",
                ht.port as "port",
                ht.tag as "tag",
                ht.is_shared as "isShared",
                ht.total_bytes as "total",
                ARRAY_AGG(
                    COALESCE(du.bytes, 0)
                    ORDER BY d.ord
                ) AS "data"
            FROM hosts_with_totals ht
            CROSS JOIN unnest(${dates}::date[]) WITH ORDINALITY AS d(date, ord)
            LEFT JOIN daily_usage du
                ON du.uuid = ht.uuid
                AND du.date = d.date
            GROUP BY ht.uuid, ht.remark, ht.address, ht.port, ht.tag, ht.is_shared, ht.total_bytes
            ORDER BY ht.total_bytes DESC;
        `;

        return await this.prisma.tx.$queryRaw<IGetHostsUsageByRange[]>(query);
    }

    public async getTopHostsByTraffic(
        start: Date,
        end: Date,
        limit: number = 5,
    ): Promise<ITopHost[]> {
        return await this.qb.kysely
            .selectFrom('hosts as h')
            .innerJoin('hostsUsageHistory as huh', 'huh.hostUuid', 'h.uuid')
            .select([
                'h.uuid',
                'h.remark',
                'h.address',
                'h.port',
                'h.tag',
                (eb) => eb.fn.sum<bigint>('huh.totalBytes').as('total'),
                (eb) => eb.fn<boolean>('bool_or', ['huh.isShared']).as('isShared'),
            ])
            .where('huh.createdAt', '>=', start)
            .where('huh.createdAt', '<=', end)
            .groupBy(['h.uuid', 'h.remark', 'h.address', 'h.port', 'h.tag'])
            .orderBy((eb) => eb.fn.sum<bigint>('huh.totalBytes'), 'desc')
            .limit(limit)
            .execute();
    }

    public async getTopHostsByTrafficForHostUuids(
        hostUuids: string[],
        start: Date,
        end: Date,
        limit: number = 5,
    ): Promise<ITopHost[]> {
        return await this.qb.kysely
            .selectFrom('hosts as h')
            .innerJoin('hostsUsageHistory as huh', 'huh.hostUuid', 'h.uuid')
            .select([
                'h.uuid',
                'h.remark',
                'h.address',
                'h.port',
                'h.tag',
                (eb) => eb.fn.sum<bigint>('huh.totalBytes').as('total'),
                (eb) => eb.fn<boolean>('bool_or', ['huh.isShared']).as('isShared'),
            ])
            .where(
                'h.uuid',
                'in',
                hostUuids.map((hostUuid) => getKyselyUuid(hostUuid)),
            )
            .where('huh.createdAt', '>=', start)
            .where('huh.createdAt', '<=', end)
            .groupBy(['h.uuid', 'h.remark', 'h.address', 'h.port', 'h.tag'])
            .orderBy((eb) => eb.fn.sum<bigint>('huh.totalBytes'), 'desc')
            .limit(limit)
            .execute();
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
            WITH daily_traffic AS (
                SELECT
                    DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date AS date,
                    SUM(total_bytes) AS bytes
                FROM hosts_usage_history
                WHERE
                    created_at >= ${start}
                    AND created_at <= ${end}
                    ${hostUuidFilter}
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
