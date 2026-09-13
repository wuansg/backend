import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '@common/database/prisma.service';

import { NodesQueuesService } from '@queue/_nodes';

type StoredGeocheckSource =
    | { type: 'DEFAULT' }
    | { type: 'IP'; value: string }
    | { type: 'INTERFACE'; value: string };

@Injectable()
export class ScheduledGeocheckTask {
    private static readonly CRON_NAME = 'scheduledGeocheck';
    private readonly logger = new Logger(ScheduledGeocheckTask.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly nodesQueuesService: NodesQueuesService,
    ) {}

    @Cron(CronExpression.EVERY_MINUTE, {
        name: ScheduledGeocheckTask.CRON_NAME,
        waitForCompletion: true,
    })
    async handleCron(): Promise<void> {
        const now = new Date();
        const nodes = await this.prisma.nodes.findMany({
            where: {
                geocheckIntervalMinutes: { not: null },
                isDisabled: false,
                isConnected: true,
            },
            select: {
                uuid: true,
                geocheckIntervalMinutes: true,
                geocheckSource: true,
                lastGeocheckScheduledAt: true,
            },
            take: 500,
        });

        for (const node of nodes) {
            const interval = node.geocheckIntervalMinutes;
            if (!interval) continue;
            const dueAt = node.lastGeocheckScheduledAt
                ? node.lastGeocheckScheduledAt.getTime() + interval * 60_000
                : 0;
            if (dueAt > now.getTime()) continue;

            const claimed = await this.prisma.nodes.updateMany({
                where: {
                    uuid: node.uuid,
                    lastGeocheckScheduledAt: node.lastGeocheckScheduledAt,
                },
                data: { lastGeocheckScheduledAt: now },
            });
            if (claimed.count !== 1) continue;

            const source = parseSource(node.geocheckSource);
            const queued = await this.nodesQueuesService.geocheckByNode({
                nodeUuid: node.uuid,
                ip: source?.type === 'IP' ? source.value : undefined,
                interface: source?.type === 'INTERFACE' ? source.value : undefined,
            });
            if (!queued) {
                this.logger.warn(`Failed to queue scheduled Geocheck for ${node.uuid}`);
            }
        }
    }
}

function parseSource(value: unknown): StoredGeocheckSource | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>;
    if (source.type === 'DEFAULT') return { type: 'DEFAULT' };
    if ((source.type === 'IP' || source.type === 'INTERFACE') && typeof source.value === 'string') {
        return { type: source.type, value: source.value };
    }
    return null;
}
