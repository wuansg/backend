import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Prisma } from '@prisma/client';

import { Injectable } from '@nestjs/common';

import { TxKyselyService } from '@common/database/tx-kysely.service';
import { ICrudHistoricalRecords } from '@common/types/crud-port';
import { trafficColumn, trafficSqlColumn } from '@common/utils/traffic-direction.util';
import {
    getUtcUsageTimestampSql,
    getUtcUsageTimestampExpression,
} from '@common/utils/utc-usage-range.util';
import { TrafficDirection } from '@libs/contracts/models';

import { Get7DaysStatsBuilder } from '../builders';
import { NodesUsageHistoryEntity } from '../entities/nodes-usage-history.entity';
import { IGet7DaysStats, IGetNodesUsageByRange, ITopNode } from '../interfaces';
import { NodesUsageHistoryConverter } from '../nodes-usage-history.converter';

@Injectable()
export class NodesUsageHistoryRepository implements ICrudHistoricalRecords<NodesUsageHistoryEntity> {
    constructor(
        private readonly prisma: TransactionHost<TransactionalAdapterPrisma>,
        private readonly qb: TxKyselyService,
        private readonly converter: NodesUsageHistoryConverter,
    ) {}

    public async create(entity: NodesUsageHistoryEntity): Promise<NodesUsageHistoryEntity> {
        const model = this.converter.fromEntityToPrismaModel(entity);
        const result = await this.prisma.tx.nodesUsageHistory.create({
            data: model,
        });

        return this.converter.fromPrismaModelToEntity(result);
    }

    public async upsertUsageHistory(
        entity: NodesUsageHistoryEntity,
    ): Promise<NodesUsageHistoryEntity> {
        const model = this.converter.fromEntityToPrismaModel(entity);
        const result = await this.prisma.tx.nodesUsageHistory.upsert({
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
            },
            where: {
                nodeUuid_createdAt: {
                    nodeUuid: entity.nodeUuid,
                    createdAt: entity.createdAt,
                },
            },
        });

        return this.converter.fromPrismaModelToEntity(result);
    }

    public async findByCriteria(
        dto: Partial<NodesUsageHistoryEntity>,
    ): Promise<NodesUsageHistoryEntity[]> {
        const list = await this.prisma.tx.nodesUsageHistory.findMany({
            where: dto,
        });
        return this.converter.fromPrismaModelsToEntities(list);
    }

    public async getStatsByDatetimeRange(start: Date, end: Date): Promise<bigint> {
        const result = await this.prisma.tx.nodesUsageHistory.aggregate({
            where: { createdAt: { gte: start, lte: end } },
            _sum: { totalBytes: true },
        });

        return result._sum.totalBytes ?? BigInt(0);
    }

    public async get7DaysStats(): Promise<IGet7DaysStats[]> {
        const { query } = new Get7DaysStatsBuilder();
        const result = await this.prisma.tx.$queryRaw<IGet7DaysStats[]>(query);
        return result;
    }

    public async getNodesUsageByRange(
        start: Date,
        end: Date,
        dates: string[],
        direction: TrafficDirection = 'total',
    ): Promise<IGetNodesUsageByRange[]> {
        const query = Prisma.sql`
            WITH daily_usage AS (
                SELECT
                    n.uuid,
                    n.name,
                    n.country_code,
                    h.created_at::date AS date,
                    SUM(h.upload_bytes) AS upload_bytes,
                    SUM(h.download_bytes) AS download_bytes,
                    SUM(h.total_bytes) AS bytes
                FROM nodes n
                INNER JOIN nodes_usage_history h ON h.node_uuid = n.uuid
                WHERE
                    h.created_at >= ${getUtcUsageTimestampSql(start)}
                    AND h.created_at <= ${getUtcUsageTimestampSql(end)}
                GROUP BY n.uuid, n.name, n.country_code, h.created_at::date
            ),
            nodes_with_totals AS (
                SELECT
                    uuid,
                    name,
                    country_code,
                    SUM(upload_bytes) AS upload_bytes,
                    SUM(download_bytes) AS download_bytes,
                    SUM(bytes) AS total_bytes
                FROM daily_usage
                GROUP BY uuid, name, country_code
            )
            SELECT
                nt.uuid as "uuid",
                nt.name as "name",
                nt.country_code as "countryCode",
                nt.total_bytes as "total",
                nt.upload_bytes as "upload",
                nt.download_bytes as "download",
                ARRAY_AGG(COALESCE(du.upload_bytes, 0) ORDER BY d.ord) AS "uploadData",
                ARRAY_AGG(COALESCE(du.download_bytes, 0) ORDER BY d.ord) AS "downloadData",
                ARRAY_AGG(
                    COALESCE(du.bytes, 0)
                    ORDER BY d.ord
                ) AS "data"
            FROM nodes_with_totals nt
            CROSS JOIN unnest(${dates}::date[]) WITH ORDINALITY AS d(date, ord)
            LEFT JOIN daily_usage du
                ON du.uuid = nt.uuid
                AND du.date = d.date
            GROUP BY nt.uuid, nt.name, nt.country_code, nt.total_bytes, nt.upload_bytes, nt.download_bytes
            ORDER BY nt.${trafficSqlColumn(direction)} DESC, nt.uuid;
        `;

        return await this.prisma.tx.$queryRaw<IGetNodesUsageByRange[]>(query);
    }

    public async getTopNodesByTraffic(
        start: Date,
        end: Date,
        limit: number = 5,
        direction: TrafficDirection = 'total',
    ): Promise<ITopNode[]> {
        return await this.qb.kysely
            .selectFrom('nodes as n')
            .innerJoin('nodesUsageHistory as h', 'h.nodeUuid', 'n.uuid')
            .select([
                'n.uuid',
                'n.name',
                'n.countryCode',
                (eb) => eb.fn.sum<bigint>('h.uploadBytes').as('upload'),
                (eb) => eb.fn.sum<bigint>('h.downloadBytes').as('download'),
                (eb) => eb.fn.sum<bigint>('h.totalBytes').as('total'),
            ])
            .where('h.createdAt', '>=', getUtcUsageTimestampExpression(start))
            .where('h.createdAt', '<=', getUtcUsageTimestampExpression(end))
            .groupBy(['n.uuid', 'n.name', 'n.countryCode'])
            .orderBy((eb) => eb.fn.sum<bigint>(`h.${trafficColumn(direction)}`), 'desc')
            .orderBy('n.uuid')
            .limit(limit)
            .execute();
    }

    public async getDailyTrafficSum(start: Date, end: Date, dates: string[]): Promise<number[]> {
        return (await this.getDirectionalDailyTrafficSum(start, end, dates)).total;
    }

    public async getDirectionalDailyTrafficSum(
        start: Date,
        end: Date,
        dates: string[],
    ): Promise<{ total: number[]; upload: number[]; download: number[] }> {
        const query = Prisma.sql`
            WITH daily_traffic AS (
                SELECT 
                    created_at::date AS date,
                    SUM(upload_bytes) AS upload_bytes,
                    SUM(download_bytes) AS download_bytes,
                    SUM(total_bytes) AS bytes
                FROM nodes_usage_history
                WHERE 
                    created_at >= ${getUtcUsageTimestampSql(start)}
                    AND created_at <= ${getUtcUsageTimestampSql(end)}
                GROUP BY created_at::date
            )
            SELECT 
                COALESCE(dt.bytes, 0) AS total,
                COALESCE(dt.upload_bytes, 0) AS upload,
                COALESCE(dt.download_bytes, 0) AS download
            FROM unnest(${dates}::date[]) WITH ORDINALITY AS d(date, ord)
            LEFT JOIN daily_traffic dt ON dt.date = d.date
            ORDER BY d.ord;
        `;

        const result =
            await this.prisma.tx.$queryRaw<
                Array<{ total: bigint; upload: bigint; download: bigint }>
            >(query);
        return {
            total: result.map((item) => Number(item.total)),
            upload: result.map((item) => Number(item.upload)),
            download: result.map((item) => Number(item.download)),
        };
    }

    public async getSumLifetime(): Promise<string> {
        const result = await this.prisma.tx.nodesUsageHistory.aggregate({
            _sum: { totalBytes: true },
        });

        if (!result._sum.totalBytes) {
            return '0';
        }

        return result._sum.totalBytes.toString();
    }
}
