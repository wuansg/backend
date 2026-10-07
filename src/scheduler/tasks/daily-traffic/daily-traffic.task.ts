import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { DailyTrafficReportService } from '@common/daily-traffic/daily-traffic-report.service';

import { TelegramBotLoggerQueueService } from '@queue/notifications/telegram-bot-logger/telegram-bot-logger.service';

@Injectable()
export class DailyTrafficTask implements OnApplicationBootstrap {
    private readonly logger = new Logger(DailyTrafficTask.name);

    constructor(
        private readonly reports: DailyTrafficReportService,
        private readonly telegramQueue: TelegramBotLoggerQueueService,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.handleCron();
    }

    @Cron(CronExpression.EVERY_MINUTE, {
        name: 'dailyTrafficTelegram',
        timeZone: 'UTC',
        waitForCompletion: true,
    })
    async handleCron(): Promise<void> {
        if (!this.reports.enabled()) return;
        try {
            await this.reports.prepareDueReport();
            for (const report of await this.reports.dueReports()) {
                await this.telegramQueue.addDailyTrafficReport(
                    report.reportDate.toISOString().slice(0, 10),
                );
            }
        } catch {
            this.logger.error('Daily traffic report scheduling failed; will retry next minute.');
        }
    }
}
