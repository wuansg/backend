import { Job } from 'bullmq';
import { Worker } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';

import { DailyTrafficReportService } from '@common/daily-traffic/daily-traffic-report.service';

import { TelegramApiError } from '@integration-modules/notifications/telegram-bot/telegram-api.error';
import { TelegramApiService } from '@integration-modules/notifications/telegram-bot/telegram-api.service';
import { TelegramTargetHealthService } from '@integration-modules/notifications/telegram-bot/telegram-target-health.service';

import { QueueWorkerStartGuard } from '../../queue-worker-lifecycle.service';
import { QUEUES_NAMES } from '../../queue.enum';
import { TelegramBotLoggerJobNames } from './enums';
import { IMessageEventPayload, TTelegramTarget } from './interfaces';
import { TelegramBotLoggerQueueService } from './telegram-bot-logger.service';

@Processor(QUEUES_NAMES.NOTIFICATIONS.TELEGRAM, {
    concurrency: 100,
    autorun: false,
    limiter: {
        max: 20,
        duration: 1_000,
    },
})
export class TelegramBotLoggerQueueProcessor extends WorkerHost implements QueueWorkerStartGuard {
    private readonly logger = new Logger(TelegramBotLoggerQueueProcessor.name);

    constructor(
        @Optional()
        private readonly telegramApiService: TelegramApiService,
        @Optional()
        private readonly telegramTargetHealthService: TelegramTargetHealthService,
        private readonly telegramBotLoggerQueueService: TelegramBotLoggerQueueService,
        private readonly dailyTrafficReports: DailyTrafficReportService,
    ) {
        super();
    }

    async prepareQueueWorkerStart(): Promise<boolean> {
        if (!this.telegramApiService) return false;

        const isHealthy = await this.telegramApiService.healthcheck();
        if (!isHealthy) {
            if (this.dailyTrafficReports.enabled()) {
                this.logger.warn(
                    'Telegram API is unavailable at startup; starting worker for durable daily report retries.',
                );
                return true;
            }
            this.logger.error('Telegram API is not healthy. Worker will not start.');
            return false;
        }

        await this.telegramTargetHealthService?.validateConfiguredTargets();
        return true;
    }

    async process(job: Job) {
        if (job.name === TelegramBotLoggerJobNames.sendDailyTrafficReport) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(job.data.reportDate ?? ''))
                throw new Error('Invalid daily traffic report date');
            let deliveredTarget: TTelegramTarget | undefined;
            const delivered = await this.dailyTrafficReports.deliver(
                new Date(`${job.data.reportDate}T00:00:00.000Z`),
                async (report) => {
                    if (!this.telegramApiService) throw new Error('Telegram unavailable');
                    if (!['HTML', 'MarkdownV2', 'RichMarkdown'].includes(report.parseMode))
                        throw new TelegramApiError(
                            'Unsupported report format',
                            undefined,
                            400,
                            false,
                        );
                    const target = report.target as TTelegramTarget;
                    if (
                        this.telegramTargetHealthService &&
                        !(await this.telegramTargetHealthService.canSend(target))
                    ) {
                        throw new Error('Telegram target circuit is open');
                    }
                    try {
                        const threadId = report.threadId
                            ? parseInt(report.threadId, 10)
                            : undefined;
                        if (report.parseMode === 'RichMarkdown') {
                            await this.telegramApiService.sendRichMarkdown(
                                report.chatId,
                                report.message,
                                { threadId },
                            );
                        } else {
                            await this.telegramApiService.sendMessage(
                                report.chatId,
                                report.message,
                                {
                                    parseMode: report.parseMode as 'HTML' | 'MarkdownV2',
                                    threadId,
                                },
                            );
                        }
                    } catch (error) {
                        if (error instanceof TelegramApiError) {
                            await this.telegramTargetHealthService
                                ?.markFailure(target, error)
                                .catch(() => undefined);
                        }
                        throw error;
                    }
                    deliveredTarget = target;
                },
            );
            if (delivered && deliveredTarget) {
                // SENT is durable before metrics/cache writes, even during a Redis outage.
                await this.telegramTargetHealthService
                    ?.markSuccess(deliveredTarget)
                    .catch(() => undefined);
            }
            return delivered;
        }
        if (!this.telegramApiService) {
            this.logger.error('Telegram API is not healthy. Skipping job.');
            return;
        }

        switch (job.name) {
            case TelegramBotLoggerJobNames.sendTelegramMessage:
                return await this.handleSendTelegramMessage(job);
            default:
                this.logger.warn(`Job "${job.name}" is not handled.`);
                break;
        }
    }

    private async handleSendTelegramMessage(job: Job<IMessageEventPayload>) {
        const { message, chatId, threadId, keyboard, target } = job.data;

        if (target && !(await this.telegramTargetHealthService?.canSend(target))) {
            this.logger.warn(`Telegram target "${target}" circuit is open; skipping job.`);
            return;
        }

        try {
            await this.telegramApiService.sendMessage(chatId, message, {
                threadId: threadId ? parseInt(threadId, 10) : undefined,
                keyboard,
            });
            if (target) await this.telegramTargetHealthService?.markSuccess(target);
        } catch (error) {
            if (target && error instanceof TelegramApiError) {
                await this.telegramTargetHealthService?.markFailure(target, error);
            }
            if (error instanceof TelegramApiError && error.retryAfter) {
                await this.telegramBotLoggerQueueService.rateLimit(error.retryAfter);

                throw Worker.RateLimitError();
            }
            if (error instanceof TelegramApiError && !error.retryable) {
                this.logger.warn(
                    `Telegram rejected job for target "${target ?? 'unknown'}" (${error.statusCode ?? 'unknown'}); retry disabled.`,
                );
                return;
            }
            this.logger.error(
                `Error handling "${TelegramBotLoggerJobNames.sendTelegramMessage}" job: ${error}`,
            );

            throw error;
        }
    }
}
