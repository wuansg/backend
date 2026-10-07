import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';

import { configSchema } from '@common/config/app-config/config.schema';
import { TypedConfigService } from '@common/config/app-config/typed-config.service';
import { DailyTrafficCollector } from '@common/daily-traffic/daily-traffic.collector';
import {
    DAILY_TRAFFIC_LAYOUT,
    DAILY_TRAFFIC_PARSE_MODE,
    dueTrafficReportDate,
    renderDailyTrafficReport,
} from '@common/daily-traffic/daily-traffic.util';
import { PrismaService } from '@common/database/prisma.service';

import { TelegramApiError } from '@integration-modules/notifications/telegram-bot/telegram-api.error';
import { TelegramApiService } from '@integration-modules/notifications/telegram-bot/telegram-api.service';

async function main() {
    const mode = process.argv[2] ?? '--check';
    if (mode === '--help') {
        console.log(
            'Usage: node dist/daily-traffic-preview.js [--check|--send]\nDefault --check is read-only; --send sends one explicitly labelled preview and never modifies the daily report outbox.',
        );
        return;
    }
    if (!['--check', '--send'].includes(mode)) throw new Error('Invalid preview mode');
    const parsed = configSchema.safeParse(process.env);
    if (!parsed.success) throw new Error('Invalid preview environment');
    const config = new ConfigService<typeof parsed.data, true>(parsed.data);
    const typed = new TypedConfigService(config);
    const db = new PrismaService();
    try {
        const date = dueTrafficReportDate(new Date(), '00:00')!;
        const summary = await new DailyTrafficCollector(db, typed).collect(date);
        const prefix = '*🆕 表格版日报预览*\n\n';
        const message = prefix + renderDailyTrafficReport(date, summary, 4096 - prefix.length);
        if (message.length > 4096) throw new Error('Preview exceeds Telegram message limit');
        if (mode === '--send') {
            if (!typed.get('IS_TELEGRAM_NOTIFICATIONS_ENABLED'))
                throw new Error('Telegram disabled');
            const target = typed.get('TELEGRAM_DAILY_TRAFFIC_TARGET');
            const destination = typed.get(
                target === 'users' ? 'TELEGRAM_NOTIFY_USERS' : 'TELEGRAM_NOTIFY_SERVICE',
            );
            if (!/^-?\d+(?::[1-9]\d*)?$/.test(destination ?? ''))
                throw new Error('Invalid preview destination');
            const [chatId, threadId] = destination!.split(':');
            const telegram = new TelegramApiService(new ConfigService(parsed.data));
            await telegram.validateTarget(chatId);
            // Explicit one-off send only: never retry an ambiguous send response automatically.
            await telegram.sendMessage(chatId, message, {
                parseMode: DAILY_TRAFFIC_PARSE_MODE,
                threadId: threadId ? Number(threadId) : undefined,
            });
        }
        console.log(
            JSON.stringify(
                {
                    reportDate: date.toISOString().slice(0, 10),
                    version: typed.get('__RW_METADATA_VERSION'),
                    sent: mode === '--send',
                    messageLength: message.length,
                    parseMode: DAILY_TRAFFIC_PARSE_MODE,
                    layout: DAILY_TRAFFIC_LAYOUT,
                    tableCount: (message.match(/^```$/gm)?.length ?? 0) / 2,
                    topHosts: summary.topHosts,
                    totals: {
                        users: summary.users,
                        nodes: summary.nodes,
                        hosts: summary.hosts,
                        forwarding: summary.forwarding,
                    },
                },
                (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
            ),
        );
    } finally {
        await db.$disconnect();
    }
}

main().catch((error: unknown) => {
    // Do not log raw environment validation, axios errors, or bot URLs/tokens.
    console.error(
        error instanceof TelegramApiError
            ? `Preview failed (Telegram status ${error.statusCode ?? 'network'}).`
            : 'Daily traffic preview failed.',
    );
    process.exitCode = 1;
});
