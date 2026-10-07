import { TelegramDailyTrafficReport } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config';
import { PrismaService } from '@common/database/prisma.service';

import { TelegramApiError } from '@integration-modules/notifications/telegram-bot/telegram-api.error';

import { DailyTrafficCollector } from './daily-traffic.collector';
import {
    DAILY_TRAFFIC_PARSE_MODE,
    dueTrafficReportDate,
    renderDailyTrafficReport,
} from './daily-traffic.util';

const LEASE_MS = 120_000;
const MAX_AGE_MS = 7 * 86_400_000;

@Injectable()
export class DailyTrafficReportService {
    private readonly logger = new Logger(DailyTrafficReportService.name);

    constructor(
        private readonly db: PrismaService,
        private readonly config: TypedConfigService,
        private readonly collector: DailyTrafficCollector,
    ) {}

    enabled(): boolean {
        return (
            this.config.get('TELEGRAM_DAILY_TRAFFIC_ENABLED') &&
            this.config.get('IS_TELEGRAM_NOTIFICATIONS_ENABLED')
        );
    }

    async prepareDueReport(now = new Date()): Promise<void> {
        if (!this.enabled()) return;
        const date = dueTrafficReportDate(now, this.config.get('TELEGRAM_DAILY_TRAFFIC_TIME_UTC'));
        if (!date) return;
        if (await this.db.telegramDailyTrafficReport.findUnique({ where: { reportDate: date } }))
            return;
        const target = this.config.get('TELEGRAM_DAILY_TRAFFIC_TARGET');
        const destination = this.config.get(
            target === 'users' ? 'TELEGRAM_NOTIFY_USERS' : 'TELEGRAM_NOTIFY_SERVICE',
        );
        if (!destination || !/^-?\d+(?::[1-9]\d*)?$/.test(destination)) {
            this.logger.error('Daily traffic report has no valid configured Telegram target.');
            return;
        }
        const [chatId, threadId] = destination.split(':');
        const message = renderDailyTrafficReport(date, await this.collector.collect(date, now));
        if (message.length > 4096)
            throw new Error('Daily traffic report exceeds Telegram message limit');
        await this.db.telegramDailyTrafficReport.createMany({
            skipDuplicates: true,
            data: [
                {
                    reportDate: date,
                    target,
                    chatId,
                    threadId,
                    message,
                    parseMode: DAILY_TRAFFIC_PARSE_MODE,
                    nextAttemptAt: now,
                },
            ],
        });
    }

    async dueReports(now = new Date()): Promise<TelegramDailyTrafficReport[]> {
        if (!this.enabled()) return [];
        await this.db.telegramDailyTrafficReport.updateMany({
            where: {
                status: { in: ['PENDING', 'SENDING'] },
                createdAt: { lt: new Date(now.getTime() - MAX_AGE_MS) },
                OR: [{ leasedUntil: null }, { leasedUntil: { lte: now } }],
            },
            data: {
                status: 'FAILED',
                lastError: 'DELIVERY_WINDOW_EXPIRED',
                leaseToken: null,
                leasedUntil: null,
            },
        });
        return this.db.telegramDailyTrafficReport.findMany({
            where: {
                OR: [
                    { status: 'PENDING', nextAttemptAt: { lte: now } },
                    { status: 'SENDING', leasedUntil: { lte: now } },
                ],
            },
            orderBy: { reportDate: 'asc' },
            take: 7,
        });
    }

    async deliver(
        reportDate: Date,
        send: (report: TelegramDailyTrafficReport) => Promise<void>,
        now = new Date(),
    ): Promise<boolean> {
        if (!this.enabled()) return false;
        const leaseToken = randomUUID();
        const claim = await this.db.telegramDailyTrafficReport.updateMany({
            where: {
                reportDate,
                OR: [
                    { status: 'PENDING', nextAttemptAt: { lte: now } },
                    { status: 'SENDING', leasedUntil: { lte: now } },
                ],
            },
            data: {
                status: 'SENDING',
                leaseToken,
                leasedUntil: new Date(now.getTime() + LEASE_MS),
                attempts: { increment: 1 },
            },
        });
        if (!claim.count) return false;
        const report = await this.db.telegramDailyTrafficReport.findUniqueOrThrow({
            where: { reportDate },
        });
        try {
            await send(report);
        } catch (error) {
            const apiError = error instanceof TelegramApiError ? error : undefined;
            const permanent = apiError && !apiError.retryable && !apiError.targetUnavailable;
            const delayMs = Math.max(
                300_000 * 2 ** Math.min(report.attempts - 1, 4),
                (apiError?.retryAfter ?? 0) * 1000,
            );
            const errorCode = apiError
                ? `TELEGRAM_${apiError.statusCode ?? 'NETWORK'}`
                : 'DELIVERY_UNAVAILABLE';
            await this.db.telegramDailyTrafficReport.updateMany({
                where: { reportDate, leaseToken, status: 'SENDING' },
                data: {
                    status: permanent ? 'FAILED' : 'PENDING',
                    nextAttemptAt: new Date(Date.now() + delayMs),
                    leaseToken: null,
                    leasedUntil: null,
                    lastError: errorCode,
                },
            });
            this.logger.warn(
                `Daily traffic report ${reportDate.toISOString().slice(0, 10)} delivery failed (${errorCode}); ${permanent ? 'manual correction required' : 'retry persisted'}.`,
            );
            // Raw axios/API errors can contain the bot token in their URL.
            throw new Error(`Daily traffic report delivery failed (${errorCode})`);
        }
        // Persist acceptance outside send catch; DB failure must retain the lease.
        await this.db.telegramDailyTrafficReport.updateMany({
            where: { reportDate, leaseToken, status: 'SENDING' },
            data: {
                status: 'SENT',
                sentAt: new Date(),
                leaseToken: null,
                leasedUntil: null,
                lastError: null,
            },
        });
        this.logger.log(`Daily traffic report ${reportDate.toISOString().slice(0, 10)} delivered.`);
        return true;
    }
}
