import { Prisma } from '@prisma/client';
import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';

import { PrismaService } from '@common/database/prisma.service';

import { TruncateNodesUserUsageHistoryCommand } from '@modules/nodes-user-usage-history/commands/truncate-nodes-user-usage-history';
import { VacuumNodesUserUsageHistoryCommand } from '@modules/nodes-user-usage-history/commands/vacuum-nodes-user-usage-history';

import { UsersQueuesService } from '@queue/_users';

import { QUEUES_NAMES } from '../queue.enum';
import { ServiceJobNames } from './enums';

@Processor(QUEUES_NAMES.SERVICE, {
    concurrency: 1,
})
export class ServiceQueueProcessor extends WorkerHost {
    private readonly logger = new Logger(ServiceQueueProcessor.name);

    constructor(
        private readonly commandBus: CommandBus,
        private readonly usersQueuesService: UsersQueuesService,
        private readonly prisma: PrismaService,
    ) {
        super();
    }

    async process(job: Job) {
        switch (job.name) {
            case ServiceJobNames.CLEAN_APPLIED_USAGE_SNAPSHOTS:
                return await this.handleCleanAppliedUsageSnapshotsJob();
            case ServiceJobNames.CLEAN_OLD_USAGE_RECORDS:
                return await this.handleCleanOldUsageRecordsJob();
            case ServiceJobNames.VACUUM_TABLES:
                return await this.handleVacuumTablesJob();
            default:
                this.logger.warn(`Job "${job.name}" is not handled.`);
                break;
        }
    }

    private async handleCleanAppliedUsageSnapshotsJob() {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000);
        const batchSize = 5_000;
        const maxBatches = 20;
        let deleted = 0;

        try {
            for (let batch = 0; batch < maxBatches; batch++) {
                const count = await this.prisma.$executeRaw(Prisma.sql`
                    WITH victims AS (
                        SELECT node_uuid, generation, sequence
                        FROM node_usage_snapshot_inbox
                        WHERE applied_at IS NOT NULL AND applied_at < ${cutoff}
                        ORDER BY applied_at
                        LIMIT ${batchSize}
                    )
                    DELETE FROM node_usage_snapshot_inbox AS inbox
                    USING victims
                    WHERE inbox.node_uuid = victims.node_uuid
                      AND inbox.generation = victims.generation
                      AND inbox.sequence = victims.sequence
                `);
                deleted += count;
                if (count < batchSize) break;
            }

            if (deleted > 0) {
                this.logger.log(`Deleted ${deleted} applied usage snapshot inbox records.`);
            }
        } catch (error) {
            this.logger.error(
                `Error handling "${ServiceJobNames.CLEAN_APPLIED_USAGE_SNAPSHOTS}" job: ${error}`,
            );
            throw error;
        }
    }

    private async handleCleanOldUsageRecordsJob() {
        try {
            await this.usersQueuesService.queues.updateUsersUsage.pause();

            this.logger.log('Resetting tables...');

            await this.commandBus.execute(new TruncateNodesUserUsageHistoryCommand());

            await this.commandBus.execute(new VacuumNodesUserUsageHistoryCommand());

            this.logger.log('Tables resetted');
        } catch (error) {
            this.logger.error(
                `Error handling "${ServiceJobNames.CLEAN_OLD_USAGE_RECORDS}" job: ${error}`,
            );
        } finally {
            await this.usersQueuesService.queues.updateUsersUsage.resume();
        }
    }

    private async handleVacuumTablesJob() {
        try {
            await this.commandBus.execute(new VacuumNodesUserUsageHistoryCommand());

            this.logger.log('Tables vacuumed successfully.');
        } catch (error) {
            this.logger.error(`Error handling "${ServiceJobNames.VACUUM_TABLES}" job: ${error}`);
        }
    }
}
