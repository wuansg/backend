import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { JOBS_INTERVALS } from '@scheduler/intervals';

import { ServiceQueueService } from '@queue/service';

@Injectable()
export class CleanAppliedUsageSnapshotsTask {
    private static readonly CRON_NAME = 'cleanAppliedUsageSnapshots';
    private readonly logger = new Logger(CleanAppliedUsageSnapshotsTask.name);

    constructor(private readonly serviceQueueService: ServiceQueueService) {}

    @Cron(JOBS_INTERVALS.SERVICE.CLEAN_APPLIED_USAGE_SNAPSHOTS, {
        name: CleanAppliedUsageSnapshotsTask.CRON_NAME,
        waitForCompletion: true,
    })
    async handleCron() {
        try {
            await this.serviceQueueService.cleanAppliedUsageSnapshots({});
        } catch (error) {
            this.logger.error(`Error in CleanAppliedUsageSnapshotsTask: ${error}`);
        }
    }
}
