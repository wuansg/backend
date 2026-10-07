import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ConfigService } from '@nestjs/config';

import { configSchema } from '@common/config/app-config/config.schema';
import { DailyTrafficReportService } from '@common/daily-traffic/daily-traffic-report.service';
import { DailyTrafficCollector } from '@common/daily-traffic/daily-traffic.collector';
import {
    DailyTrafficSummary,
    escapeRichMarkdown,
    countDailyTrafficTables,
    dueTrafficReportDate,
    renderDailyTrafficReport,
    trafficBytes,
} from '@common/daily-traffic/daily-traffic.util';

import { TelegramApiError } from '@integration-modules/notifications/telegram-bot/telegram-api.error';
import { TelegramApiService } from '@integration-modules/notifications/telegram-bot/telegram-api.service';

import { TelegramBotLoggerQueueProcessor } from '@queue/notifications/telegram-bot-logger/telegram-bot-logger.processor';
import { TelegramBotLoggerQueueService } from '@queue/notifications/telegram-bot-logger/telegram-bot-logger.service';

const empty = { upload: 0n, download: 0n, total: 0n };
const summary: DailyTrafficSummary = {
    nodes: empty,
    users: { ...empty, activeUsers: 0 },
    hosts: empty,
    forwarding: empty,
    topNodes: [],
    topUploadNodes: [],
    topHosts: [],
    topForwardingNodes: [],
    health: { enabled: 13, connected: 13, pending: 0, errors: 0, stale: 0 },
    userRecordsDisabled: false,
};

// Check genuine pipe tables and literal names, not an aligned preformatted substitute.
function assertSafeMarkdown(message: string) {
    assert.ok(!message.includes('```'), 'Tables must not be enclosed in code fences');
    assert.ok(!/^\d+\\?\. /m.test(message), 'Names must stay in the same table row as usage');
    let bold = false;
    for (let i = 0; i < message.length; i++) {
        const character = message[i];
        if (character === '\\') {
            assert.ok(i + 1 < message.length, 'No dangling escape');
            i++;
        } else if (message.startsWith('**', i)) {
            bold = !bold;
            i++;
        } else if (bold && character === '|') {
            assert.fail('Literal table pipes in names must be escaped');
        } else if (['`', '<', '*'].includes(character)) {
            assert.fail('Formatting injection in name');
        }
    }
    assert.equal(bold, false, 'Balanced bold');
    const tables = reportTables(message);
    assert.equal(tables.length, countDailyTrafficTables(message));
    for (const table of tables) {
        assert.ok(table.length >= 3, 'Header, delimiter and at least one data row');
        assert.ok(
            table.every((row) => row.length === table[0].length),
            'Names must not inject extra cells',
        );
        assert.ok(
            table[1].every((cell) => /^:?---:?$/.test(cell)),
            'GFM alignment row',
        );
    }
}

function markdownCells(line: string): string[] {
    const cells: string[] = [];
    let cell = '';
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '\\') {
            cell += line[i] + (line[++i] ?? '');
        } else if (line[i] === '|') {
            cells.push(cell.trim());
            cell = '';
        } else cell += line[i];
    }
    assert.equal(cell.trim(), '', 'Trailing table border');
    return cells.slice(1);
}

const reportTables = (message: string) =>
    message
        .split('\n\n')
        .filter((block) => block.startsWith('| '))
        .map((block) => block.split('\n').map(markdownCells));

async function unitTests() {
    assert.equal(dueTrafficReportDate(new Date('2026-10-07T00:09:59Z')), null);
    assert.equal(
        dueTrafficReportDate(new Date('2026-10-07T00:10:00Z'))?.toISOString(),
        '2026-10-06T00:00:00.000Z',
    );
    assert.equal(
        dueTrafficReportDate(new Date('2024-03-01T23:59:00Z'))?.toISOString(),
        '2024-02-29T00:00:00.000Z',
    );
    assert.equal(
        dueTrafficReportDate(new Date('2026-01-01T00:10:00Z'))?.toISOString(),
        '2025-12-31T00:00:00.000Z',
    );
    assert.equal(dueTrafficReportDate(new Date('2026-10-07T12:29:00Z'), '12:30'), null);
    assert.equal(trafficBytes(1024n), '1.00 KiB');
    assert.equal(trafficBytes(9_223_372_036_854_775_807n), '8.00 EiB');
    const base = {
        DATABASE_URL: 'postgresql://fixture',
        APP_SECRET: 'fixture-secret',
        FRONT_END_DOMAIN: '*',
        METRICS_USER: 'fixture',
        METRICS_PASS: 'fixture',
        SUB_PUBLIC_DOMAIN: 'fixture.invalid',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379',
    };
    assert.equal(configSchema.parse(base).TELEGRAM_DAILY_TRAFFIC_ENABLED, false);
    const enabled = {
        ...base,
        TELEGRAM_DAILY_TRAFFIC_ENABLED: 'true',
        IS_TELEGRAM_NOTIFICATIONS_ENABLED: 'true',
        TELEGRAM_BOT_TOKEN: 'fixture',
        TELEGRAM_NOTIFY_USERS: '-100123:45',
        TELEGRAM_DAILY_TRAFFIC_TARGET: 'users',
    };
    assert.ok(configSchema.safeParse(enabled).success);
    for (const patch of [
        { TELEGRAM_DAILY_TRAFFIC_TIME_UTC: '24:00' },
        { TELEGRAM_DAILY_TRAFFIC_TOP_N: '6' },
        { TELEGRAM_NOTIFY_USERS: 'change_me' },
        { TELEGRAM_NOTIFY_USERS: '123:0' },
        { IS_TELEGRAM_NOTIFICATIONS_ENABLED: 'false' },
    ]) {
        assert.equal(configSchema.safeParse({ ...enabled, ...patch }).success, false);
    }
    const rendered = renderDailyTrafficReport(new Date('2026-10-06T00:00:00Z'), {
        ...summary,
        nodes: { ...empty, total: 100n },
        topNodes: [{ ...empty, name: '<b>&bad\nname', uuid: 'fixture' }],
    });
    assert.ok(rendered.includes('\\<b\\>\\&bad name'));
    assert.ok(!rendered.includes('&lt;'), 'Markdown must not use HTML entities');
    assert.ok(rendered.includes('未拆分：**100 B**'));
    assert.ok(rendered.includes('暂无用量'));
    assert.ok(rendered.includes('北京时间：10-06 08:00 → 10-07 08:00'));
    assertSafeMarkdown(rendered);
    const summaryTable = reportTables(rendered)[0];
    assert.deepEqual(summaryTable[0], ['类型', '总量', '上传', '下载']);
    assert.deepEqual(
        summaryTable.find((row) => row[0] === '节点'),
        ['节点', '100 B', '0 B', '0 B'],
    );
    for (const label of ['用户', '节点', 'Host', '转发'])
        assert.ok(
            summaryTable.some((row) => row[0] === label),
            `Summary table retains ${label}`,
        );
    const reserved = Array.from({ length: 94 }, (_value, i) => String.fromCharCode(33 + i))
        .filter((character) => !/[a-z0-9]/i.test(character))
        .join('');
    assert.equal(escapeRichMarkdown(reserved), Array.from(reserved, (c) => '\\' + c).join(''));
    assert.equal(escapeRichMarkdown('中文 🇭🇰'), '中文 🇭🇰');
    for (const name of [
        reserved,
        '*'.repeat(400),
        '\\'.repeat(400),
        '\n\t ',
        '🇭🇰'.repeat(400),
        'x\\| y|z',
        '<tg-math>x</tg-math>',
        '![x](https://invalid/x)',
        '$x$',
    ]) {
        const escaped = renderDailyTrafficReport(new Date('2026-10-06T00:00:00Z'), {
            ...summary,
            topNodes: [{ ...empty, uuid: 'fixture', name }],
            topHosts: [{ ...empty, groupKey: 'fixture', name, nodeName: name, aliasCount: 2 }],
        });
        assertSafeMarkdown(escaped);
    }
    const hostRendered = renderDailyTrafficReport(new Date('2026-10-06T00:00:00Z'), {
        ...summary,
        topHosts: [
            {
                upload: 10n,
                download: 90n,
                total: 100n,
                name: 'Host <&>',
                nodeName: 'Node <&>',
                aliasCount: 2,
                groupKey: 'group',
            },
        ],
        topUploadNodes: [
            { upload: 90n, download: 10n, total: 100n, name: 'upload-winner', uuid: 'node' },
        ],
    });
    assert.ok(hostRendered.includes('Host \\<\\&\\>'));
    assert.ok(hostRendered.includes('Node \\<\\&\\>（共享×2）'));
    assert.ok(
        hostRendered.includes('| **upload\\-winner** | 90 B | 10 B | 100 B |'),
        'Name and usage are in one actual table row; upload ranking puts upload first',
    );
    const hostTables = reportTables(hostRendered);
    assert.equal(hostTables.length, 3, 'Summary, Host and upload ranking tables');
    assert.deepEqual(hostTables[1][0], ['Host', '节点', '总量', '上传', '下载']);
    assert.deepEqual(hostTables[1][2].slice(2), ['100 B', '10 B', '90 B']);
    assert.deepEqual(hostTables[2][0], ['节点', '上传', '下载', '总量']);
    assert.deepEqual(hostTables[2][2].slice(1), ['90 B', '10 B', '100 B']);
    assertSafeMarkdown(hostRendered);
    const worstRows = Array.from({ length: 5 }, () => ({
        name: reserved.repeat(40),
        uuid: 'fixture',
        upload: 9_223_372_036_854_775_807n,
        download: 9_223_372_036_854_775_807n,
        total: 9_223_372_036_854_775_807n,
    }));
    const worst = renderDailyTrafficReport(new Date('2026-10-06T00:00:00Z'), {
        ...summary,
        topNodes: worstRows,
        topUploadNodes: worstRows,
        topHosts: worstRows.map((row) => ({
            ...row,
            nodeName: reserved.repeat(40),
            aliasCount: 100,
            groupKey: 'fixture',
        })),
        topForwardingNodes: worstRows,
        health: { ...summary.health, pending: 1, stale: 2, errors: 1 },
        userRecordsDisabled: true,
    });
    assert.ok(worst.length < 4096, `Worst escaped message: ${worst.length}`);
    assert.ok(worst.includes('Host 用量 Top 5'), 'Length budgeting must retain Host ranking');
    assert.ok(worst.includes('🔀 转发节点排行'), 'Length budgeting must retain every section');
    assertSafeMarkdown(worst);
    assert.equal(reportTables(worst).length, 5, 'All usage and ranking sections use tables');
    const nearUnitBoundary = renderDailyTrafficReport(new Date('2026-10-06T00:00:00Z'), {
        ...summary,
        nodes: { upload: 1_048_575n, download: 1_048_575n, total: 1_048_575n },
    });
    assert.deepEqual(
        reportTables(nearUnitBoundary)[0]
            .find((row) => row[0] === '节点')
            ?.slice(1),
        ['1024.00 KiB', '1024.00 KiB', '1024.00 KiB'],
    );
    const previewPrefix = '**🆕 Markdown 表格日报预览**\n\n';
    const bounded = renderDailyTrafficReport(
        new Date('2026-10-06T00:00:00Z'),
        {
            ...summary,
            topNodes: worstRows,
            topUploadNodes: worstRows,
            topForwardingNodes: worstRows,
            topHosts: worstRows.map((row) => ({
                ...row,
                nodeName: reserved.repeat(40),
                aliasCount: 100,
                groupKey: 'fixture',
            })),
        },
        4096 - previewPrefix.length,
    );
    assert.ok((previewPrefix + bounded).length <= 4096, 'Leave space for the preview label');
    assertSafeMarkdown(previewPrefix + bounded);
    const api = new TelegramApiService(
        new ConfigService({
            TELEGRAM_BOT_TOKEN: 'fixture',
            TELEGRAM_BOT_API_ROOT: 'https://fixture.invalid',
        }),
    );
    const payloads: Array<Record<string, any>> = [];
    const paths: string[] = [];
    (api as any).http = {
        post: async (path: string, payload: Record<string, any>) => {
            paths.push(path);
            payloads.push(payload);
            return {
                data: {
                    ok: true,
                    result: {
                        message_id: 123,
                        rich_message: {
                            blocks: reportTables(hostRendered).map(() => ({ type: 'table' })),
                        },
                    },
                },
            };
        },
    };
    await api.sendMessage('fixture', '<b>Original notification</b>');
    await api.sendMessage('fixture', hostRendered, { parseMode: 'MarkdownV2', threadId: 45 });
    assert.equal(payloads[0].parse_mode, 'HTML', 'Other notifications keep their default HTML');
    assert.equal(payloads[0].text, '<b>Original notification</b>');
    assert.equal(payloads[1].parse_mode, 'MarkdownV2');
    assert.equal(payloads[1].text, hostRendered);
    assert.equal(payloads[1].message_thread_id, 45);
    const receipt = await api.sendRichMarkdown('fixture', hostRendered, { threadId: 45 });
    assert.deepEqual(paths, ['/sendMessage', '/sendMessage', '/sendRichMessage']);
    assert.deepEqual(payloads[2].rich_message, {
        markdown: hostRendered,
        skip_entity_detection: true,
    });
    assert.equal(payloads[2].message_thread_id, 45);
    assert.equal(
        payloads[2].parse_mode,
        undefined,
        'Rich Markdown is not a sendMessage parse_mode',
    );
    assert.deepEqual(receipt, { messageId: 123, nativeTableCount: 3, returnedRichMessage: true });
    (api as any).http.post = async () => ({ data: { ok: true, result: { message_id: 124 } } });
    assert.deepEqual(
        await api.sendRichMarkdown('fixture', hostRendered),
        {
            messageId: 124,
            nativeTableCount: 0,
            returnedRichMessage: false,
        },
        'Missing formatting metadata after acceptance must not cause a duplicate retry',
    );
    (api as any).http.post = async () => ({
        data: { ok: false, error_code: 429, parameters: { retry_after: 30 } },
    });
    await assert.rejects(
        api.sendRichMarkdown('fixture', hostRendered),
        (error: unknown) =>
            error instanceof TelegramApiError &&
            error.statusCode === 429 &&
            error.retryAfter === 30 &&
            error.retryable,
    );
    let capturedOptions: any;
    const queue = new TelegramBotLoggerQueueService({
        add: async (_name: string, data: unknown, options: unknown) => {
            capturedOptions = options;
            return data;
        },
    } as any);
    await queue.addDailyTrafficReport('2026-10-06');
    assert.equal(capturedOptions.jobId, 'daily-traffic-2026-10-06');
    assert.equal(capturedOptions.attempts, 1);
    assert.equal(capturedOptions.removeOnComplete, true);
    let sent = 0;
    let circuitOpen = true;
    let reportMode = 'HTML';
    const processor = new TelegramBotLoggerQueueProcessor(
        {
            sendMessage: async (_chat: string, _message: string, options: any) => {
                assert.notEqual(reportMode, 'RichMarkdown');
                assert.equal(options.threadId, 45);
                assert.equal(options.parseMode, reportMode);
                sent++;
            },
            sendRichMarkdown: async (_chat: string, _message: string, options: any) => {
                assert.equal(reportMode, 'RichMarkdown');
                assert.equal(options.threadId, 45);
                sent++;
            },
        } as any,
        {
            canSend: async () => !circuitOpen,
            markSuccess: async () => {
                throw new Error('redis unavailable');
            },
        } as any,
        queue,
        {
            deliver: async (_date: Date, callback: any) => {
                await callback({
                    chatId: '-100123',
                    threadId: '45',
                    message: 'fixture',
                    target: 'users',
                    parseMode: reportMode,
                });
                return true;
            },
        } as any,
    );
    const job = { name: 'sendDailyTrafficReport', data: { reportDate: '2026-10-06' } } as any;
    await assert.rejects(processor.process(job), /circuit is open/);
    assert.equal(sent, 0);
    circuitOpen = false;
    await processor.process(job);
    assert.equal(sent, 1, 'Health cache failure after acceptance must not cause failure');
    reportMode = 'MarkdownV2';
    await processor.process(job);
    assert.equal(sent, 2, "Worker must use each frozen report's stored format");
    reportMode = 'RichMarkdown';
    await processor.process(job);
    assert.equal(sent, 3, 'New reports use the native Rich Markdown endpoint');
    reportMode = 'invalid';
    await assert.rejects(processor.process(job), /Unsupported report format/);
    assert.equal(sent, 3, 'Invalid formats must not reach the Telegram API');
    await assert.rejects(processor.process({ ...job, data: { reportDate: 'bad' } }), /Invalid/);
    const offlineProcessor = new TelegramBotLoggerQueueProcessor(
        { healthcheck: async () => false } as any,
        undefined as any,
        queue,
        { enabled: () => true } as any,
    );
    assert.equal(
        await offlineProcessor.prepareQueueWorkerStart(),
        true,
        'Daily retries must recover a startup Telegram outage without a restart',
    );
    console.log(
        'Daily traffic unit tests passed (actual Markdown tables, native receipt, legacy HTML/MarkdownV2, UTC, BigInt, length, queue, circuit).',
    );
}

async function databaseTests(testUrl: string) {
    const url = new URL(testUrl);
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
    assert.equal(url.pathname, '/remnawave_daily_traffic_test');
    assert.equal(url.username, 'daily_traffic_test');
    assert.equal(url.searchParams.get('connection_limit'), '1');
    const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
    try {
        const [existing] = await db.$queryRaw<
            Array<{ count: bigint }>
        >`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'`;
        assert.equal(existing.count, 0n, 'Fixture database must be empty; refusing to overwrite');
        const migration = readFileSync(
            'prisma/migrations/20261007000000_telegram_daily_traffic_reports/migration.sql',
            'utf8',
        );
        for (const statement of migration.split(';').filter((value) => value.trim()))
            await db.$executeRawUnsafe(statement);
        // Emulate a previously frozen HTML report before applying the additive migration.
        await db.$executeRaw`INSERT INTO telegram_daily_traffic_reports
            (report_date,target,chat_id,message,status,attempts,sent_at)
            VALUES ('2026-09-30','users','fixture','<b>Frozen HTML</b>','SENT',1,'2026-10-01T00:10:00Z')`;
        const markdownMigration = readFileSync(
            'prisma/migrations/20261007000200_telegram_daily_traffic_markdown/migration.sql',
            'utf8',
        );
        for (const statement of markdownMigration.split(';').filter((value) => value.trim()))
            await db.$executeRawUnsafe(statement);
        await db.$executeRaw`INSERT INTO telegram_daily_traffic_reports
            (report_date,target,chat_id,message,parse_mode,status)
            VALUES ('2026-09-29','users','fixture','*Frozen MarkdownV2*','MarkdownV2','PENDING')`;
        const richMigration = readFileSync(
            'prisma/migrations/20261007000300_telegram_daily_traffic_rich_markdown/migration.sql',
            'utf8',
        );
        for (const statement of richMigration.split(';').filter((value) => value.trim()))
            await db.$executeRawUnsafe(statement);
        const legacyMarkdownDate = new Date('2026-09-29T00:00:00Z');
        const legacyMarkdown = await db.telegramDailyTrafficReport.findUniqueOrThrow({
            where: { reportDate: legacyMarkdownDate },
        });
        assert.equal(legacyMarkdown.parseMode, 'MarkdownV2');
        assert.equal(legacyMarkdown.message, '*Frozen MarkdownV2*');
        assert.equal(legacyMarkdown.status, 'PENDING');
        assert.equal(legacyMarkdown.attempts, 0);
        await db.telegramDailyTrafficReport.delete({ where: { reportDate: legacyMarkdownDate } });
        const legacyDate = new Date('2026-09-30T00:00:00Z');
        const legacy = await db.telegramDailyTrafficReport.findUniqueOrThrow({
            where: { reportDate: legacyDate },
        });
        assert.equal(legacy.parseMode, 'HTML');
        assert.equal(legacy.message, '<b>Frozen HTML</b>');
        assert.equal(legacy.status, 'SENT');
        assert.equal(legacy.attempts, 1);
        assert.equal(legacy.sentAt?.toISOString(), '2026-10-01T00:10:00.000Z');
        await assert.rejects(
            db.$executeRaw`UPDATE telegram_daily_traffic_reports SET parse_mode='invalid' WHERE report_date='2026-09-30'`,
        );
        await db.telegramDailyTrafficReport.delete({ where: { reportDate: legacyDate } });
        const a = '00000000-0000-4000-8000-000000000001';
        const b = '00000000-0000-4000-8000-000000000002';
        for (const ddl of [
            'CREATE TABLE nodes (uuid UUID PRIMARY KEY, name TEXT, is_connected BOOLEAN, is_disabled BOOLEAN)',
            'CREATE TABLE nodes_usage_history (node_uuid UUID, created_at TIMESTAMP(3), upload_bytes BIGINT, download_bytes BIGINT, total_bytes BIGINT)',
            'CREATE TABLE nodes_user_usage_history (user_id BIGINT, created_at DATE, upload_bytes BIGINT, download_bytes BIGINT, total_bytes BIGINT)',
            'CREATE TABLE hosts (uuid UUID PRIMARY KEY, remark TEXT, view_position INTEGER)',
            'CREATE TABLE hosts_usage_history (node_uuid UUID, inbound_tag TEXT, created_at TIMESTAMP(3), upload_bytes BIGINT, download_bytes BIGINT, total_bytes BIGINT, host_uuid UUID)',
            'CREATE TABLE node_forwarding_usage_history (node_uuid UUID, created_at TIMESTAMPTZ(3), upload_bytes BIGINT, download_bytes BIGINT, total_bytes BIGINT)',
            'CREATE TABLE node_usage_snapshot_state (node_uuid UUID, pending INTEGER, last_error TEXT, last_success_at TIMESTAMP(3))',
            `INSERT INTO nodes VALUES ('${a}', 'upload-node', TRUE, FALSE), ('${b}', 'download-node', FALSE, FALSE)`,
            `INSERT INTO nodes_usage_history VALUES ('${a}','2026-10-01 23:59:59.999',90,10,150), ('${b}','2026-10-01 00:00:00',5,195,200), ('${b}','2026-10-02 00:00:00',999999,0,999999), ('${b}','2026-09-30 23:59:59.999',999999,0,999999)`,
            `INSERT INTO nodes_user_usage_history VALUES (1,'2026-10-01',90,10,150), (1,'2026-10-01',5,195,200), (2,'2026-10-02',999999,0,999999)`,
            `INSERT INTO hosts_usage_history (node_uuid,inbound_tag,created_at,upload_bytes,download_bytes,total_bytes) VALUES ('${a}','shared','2026-10-01 23:00:00',90,10,150), ('${a}','shared','2026-10-01 23:00:00',90,10,150), ('${b}','other','2026-10-01 00:00:00',5,195,200), ('${b}','other','2026-10-02 00:00:00',999999,0,999999)`,
            `INSERT INTO hosts VALUES ('00000000-0000-4000-8000-000000000011','shared-a',1), ('00000000-0000-4000-8000-000000000012','shared-b',2), ('00000000-0000-4000-8000-000000000013','download-host',3)`,
            `UPDATE hosts_usage_history SET host_uuid = CASE WHEN inbound_tag = 'other' THEN '00000000-0000-4000-8000-000000000013'::uuid ELSE '00000000-0000-4000-8000-000000000011'::uuid END`,
            `UPDATE hosts_usage_history SET host_uuid = '00000000-0000-4000-8000-000000000012' WHERE ctid = (SELECT ctid FROM hosts_usage_history WHERE inbound_tag='shared' LIMIT 1)`,
            `INSERT INTO node_forwarding_usage_history VALUES ('${b}','2026-10-01 23:59:59.999Z',8,12,20), ('${b}','2026-10-02 00:00:00Z',999999,0,999999)`,
            `INSERT INTO node_usage_snapshot_state VALUES ('${a}',2,NULL,'2026-10-02 00:10:00'), ('${b}',0,'fixture','2026-10-01 23:00:00')`,
        ])
            await db.$executeRawUnsafe(ddl);
        const config: any = {
            TELEGRAM_DAILY_TRAFFIC_ENABLED: true,
            IS_TELEGRAM_NOTIFICATIONS_ENABLED: true,
            TELEGRAM_DAILY_TRAFFIC_TIME_UTC: '00:10',
            TELEGRAM_DAILY_TRAFFIC_TARGET: 'users',
            TELEGRAM_NOTIFY_USERS: '-100123:45',
            TELEGRAM_DAILY_TRAFFIC_TOP_N: 1,
            SERVICE_DISABLE_USER_USAGE_RECORDS: false,
        };
        const typed: any = { get: (key: string) => config[key] };
        const collector = new DailyTrafficCollector(db as any, typed);
        const date = new Date('2026-10-01T00:00:00Z');
        const now = new Date('2026-10-02T00:10:00Z');
        for (const timezone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
            await db.$executeRawUnsafe(`SET TIME ZONE '${timezone}'`);
            const stats = await collector.collect(date, now);
            assert.deepEqual(stats.nodes, { upload: 95n, download: 205n, total: 350n });
            assert.deepEqual(stats.hosts, stats.nodes, 'Shared Host aliases counted once');
            assert.deepEqual(stats.users, { ...stats.nodes, activeUsers: 1 });
            assert.deepEqual(stats.forwarding, { upload: 8n, download: 12n, total: 20n });
            assert.equal(stats.topNodes[0].name, 'download-node');
            assert.equal(stats.topUploadNodes[0].name, 'upload-node');
            assert.equal(stats.topHosts.length, 1);
            assert.equal(
                stats.topHosts[0].name,
                'download-host',
                'Dedup before ranking: duplicate aliases must not outrank the real winner',
            );
            assert.deepEqual(
                {
                    upload: stats.topHosts[0].upload,
                    download: stats.topHosts[0].download,
                    total: stats.topHosts[0].total,
                },
                { upload: 5n, download: 195n, total: 200n },
            );
            config.TELEGRAM_DAILY_TRAFFIC_TOP_N = 5;
            const full = await collector.collect(date, now);
            assert.equal(full.topHosts.length, 2);
            assert.equal(full.topHosts[1].name, 'shared-a');
            assert.equal(full.topHosts[1].nodeName, 'upload-node');
            assert.equal(full.topHosts[1].aliasCount, 2);
            assert.equal(
                full.topHosts.reduce((sum, host) => sum + host.total, 0n),
                stats.hosts.total,
            );
            assert.notEqual(full.topHosts[0].groupKey, full.topHosts[1].groupKey);
            config.TELEGRAM_DAILY_TRAFFIC_TOP_N = 1;
            assert.deepEqual(stats.health, {
                enabled: 2,
                connected: 1,
                pending: 2,
                errors: 1,
                stale: 1,
            });
            assert.deepEqual(
                (await collector.collect(new Date('2026-10-03T00:00:00Z'), now)).nodes,
                empty,
            );
        }
        const reports = new DailyTrafficReportService(db as any, typed, collector);
        await reports.prepareDueReport(new Date('2026-10-02T00:09:59Z'));
        assert.equal(await db.telegramDailyTrafficReport.count(), 0);
        await Promise.all([reports.prepareDueReport(now), reports.prepareDueReport(now)]);
        assert.equal(
            await db.telegramDailyTrafficReport.count(),
            1,
            'Concurrent schedulers create one report',
        );
        assert.equal(
            (await db.telegramDailyTrafficReport.findUniqueOrThrow({ where: { reportDate: date } }))
                .threadId,
            '45',
        );
        assert.equal(
            (await db.telegramDailyTrafficReport.findUniqueOrThrow({ where: { reportDate: date } }))
                .parseMode,
            'RichMarkdown',
        );
        let calls = 0;
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => {
            release = resolve;
        });
        let started!: () => void;
        const sending = new Promise<void>((resolve) => {
            started = resolve;
        });
        const first = reports.deliver(
            date,
            async (report) => {
                assert.equal(report.parseMode, 'RichMarkdown');
                assertSafeMarkdown(report.message);
                calls++;
                started();
                await blocked;
            },
            now,
        );
        await sending;
        assert.equal(
            await reports.deliver(
                date,
                async () => {
                    calls++;
                },
                now,
            ),
            false,
        );
        assert.equal(
            (await db.telegramDailyTrafficReport.findUniqueOrThrow({ where: { reportDate: date } }))
                .status,
            'SENDING',
        );
        release();
        assert.equal(await first, true);
        assert.equal(
            await reports.deliver(
                date,
                async () => {
                    calls++;
                },
                now,
            ),
            false,
        );
        assert.equal(calls, 1);
        assert.equal((await reports.dueReports(now)).length, 0);
        // Only modify this disposable fixture row; no real Telegram messages.
        const reset = (data: any = {}) =>
            db.telegramDailyTrafficReport.update({
                where: { reportDate: date },
                data: {
                    status: 'PENDING',
                    nextAttemptAt: now,
                    attempts: 0,
                    leaseToken: null,
                    leasedUntil: null,
                    sentAt: null,
                    ...data,
                },
            });
        await reset();
        await assert.rejects(
            reports.deliver(
                date,
                async () => {
                    throw new TelegramApiError('secret-fixture-must-not-leak', 1200, 429);
                },
                now,
            ),
            /TELEGRAM_429/,
        );
        const retry = await db.telegramDailyTrafficReport.findUniqueOrThrow({
            where: { reportDate: date },
        });
        assert.equal(retry.status, 'PENDING');
        assert.equal(retry.sentAt, null);
        assert.equal(retry.lastError, 'TELEGRAM_429');
        assert.ok(retry.nextAttemptAt.getTime() >= Date.now() + 1_199_000);
        assert.equal(
            await reports.deliver(
                date,
                async () => {
                    calls++;
                },
                now,
            ),
            false,
        );
        await reset();
        await assert.rejects(
            reports.deliver(
                date,
                async () => {
                    throw new TelegramApiError('unavailable', undefined, 403, false, true);
                },
                now,
            ),
        );
        assert.equal(
            (await db.telegramDailyTrafficReport.findUniqueOrThrow({ where: { reportDate: date } }))
                .status,
            'PENDING',
        );
        await reset();
        await assert.rejects(
            reports.deliver(
                date,
                async () => {
                    throw new TelegramApiError('bad markup', undefined, 400, false);
                },
                now,
            ),
        );
        assert.equal(
            (await db.telegramDailyTrafficReport.findUniqueOrThrow({ where: { reportDate: date } }))
                .status,
            'FAILED',
        );
        await reset({ status: 'SENDING', leasedUntil: new Date(now.getTime() + 120_000) });
        assert.equal(
            await reports.deliver(
                date,
                async () => {
                    calls++;
                },
                now,
            ),
            false,
        );
        assert.equal(
            await reports.deliver(
                date,
                async () => {
                    calls++;
                },
                new Date(now.getTime() + 120_001),
            ),
            true,
        );
        await reset({ createdAt: new Date(now.getTime() - 8 * 86_400_000) });
        assert.equal((await reports.dueReports(now)).length, 0);
        assert.equal(
            (await db.telegramDailyTrafficReport.findUniqueOrThrow({ where: { reportDate: date } }))
                .lastError,
            'DELIVERY_WINDOW_EXPIRED',
        );
        config.TELEGRAM_DAILY_TRAFFIC_ENABLED = false;
        await reports.prepareDueReport(new Date('2026-10-03T00:10:00Z'));
        assert.equal(await db.telegramDailyTrafficReport.count(), 1);
        assert.equal(
            await reports.deliver(
                date,
                async () => {
                    throw new Error('Should not send');
                },
                now,
            ),
            false,
        );
        console.log(
            'Daily traffic SQL tests passed (3 timezones, dedup, ranking, concurrency, retries, failures, leases, expiry, disabled).',
        );
    } finally {
        await db.$disconnect();
    }
}

async function main() {
    await unitTests();
    if (process.env.DAILY_TRAFFIC_TEST_DATABASE_URL)
        await databaseTests(process.env.DAILY_TRAFFIC_TEST_DATABASE_URL);
    else
        console.log(
            'SQL tests skipped: set DAILY_TRAFFIC_TEST_DATABASE_URL to an empty isolated fixture database.',
        );
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
