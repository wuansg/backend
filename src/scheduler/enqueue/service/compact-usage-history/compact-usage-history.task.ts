import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { JOBS_INTERVALS } from '@scheduler/intervals';

import { ServiceQueueService } from '@queue/service';

@Injectable()
export class CompactUsageHistoryTask {
    private static readonly CRON_NAME = 'compactUsageHistory';
    private readonly logger = new Logger(CompactUsageHistoryTask.name);

    constructor(private readonly serviceQueueService: ServiceQueueService) {}

    @Cron(JOBS_INTERVALS.SERVICE.COMPACT_USAGE_HISTORY, {
        name: CompactUsageHistoryTask.CRON_NAME,
        timeZone: 'UTC',
        waitForCompletion: true,
    })
    async handleCron() {
        try {
            await this.serviceQueueService.compactUsageHistory({});
        } catch (error) {
            this.logger.error(`Error in CompactUsageHistoryTask: ${error}`);
        }
    }
}
