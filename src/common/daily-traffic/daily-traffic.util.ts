export interface DailyTrafficUsage {
    upload: bigint;
    download: bigint;
    total: bigint;
}

export interface DailyTrafficNode extends DailyTrafficUsage {
    name: string;
    uuid: string;
}

export interface DailyTrafficHost extends DailyTrafficUsage {
    groupKey: string;
    name: string;
    nodeName: string;
    aliasCount: number;
}

export interface DailyTrafficSummary {
    nodes: DailyTrafficUsage;
    users: DailyTrafficUsage & { activeUsers: number };
    hosts: DailyTrafficUsage;
    forwarding: DailyTrafficUsage;
    topNodes: DailyTrafficNode[];
    topUploadNodes: DailyTrafficNode[];
    topHosts: DailyTrafficHost[];
    topForwardingNodes: DailyTrafficNode[];
    health: { enabled: number; connected: number; pending: number; errors: number; stale: number };
    userRecordsDisabled: boolean;
}

export function dueTrafficReportDate(now: Date, timeUtc = '00:10'): Date | null {
    const [hour, minute] = timeUtc.split(':').map(Number);
    if (now.getUTCHours() * 60 + now.getUTCMinutes() < hour * 60 + minute) return null;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
}

export function trafficBytes(bytes: bigint): string {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'];
    let divisor = 1n;
    let unit = 0;
    while (bytes >= divisor * 1024n && unit < units.length - 1) {
        divisor *= 1024n;
        unit++;
    }
    if (unit === 0) return `${bytes} B`;
    const rounded = (bytes * 100n + divisor / 2n) / divisor;
    return `${rounded / 100n}.${String(rounded % 100n).padStart(2, '0')} ${units[unit]}`;
}

// MarkdownV2 has separate escaping rules for ordinary text and inline code.
export const escapeTelegramMarkdownV2 = (text: string) =>
    text.replace(/[\\_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');

const escapeTelegramCode = (text: string) => text.replace(/[\\`]/g, '\\$&');

export const telegramMarkdownCode = (text: string) => '`' + escapeTelegramCode(text) + '`';

export const telegramMarkdownPre = (text: string) => '```\n' + escapeTelegramCode(text) + '\n```';

export const DAILY_TRAFFIC_PARSE_MODE = 'MarkdownV2' as const;
export const DAILY_TRAFFIC_LAYOUT = 'tables' as const;

const escapeName = (name: string, maxLength: number) => {
    const characters = Array.from(name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() || '未命名');
    const clipped =
        characters.length > maxLength
            ? `${characters.slice(0, maxLength - 1).join('')}…`
            : characters.join('');
    return escapeTelegramMarkdownV2(clipped);
};

const usageCode = (bytes: bigint) => telegramMarkdownCode(trafficBytes(bytes));

// Table cells contain only fixed Chinese labels or ASCII numbers/units, never names/emojis.
const cellWidth = (text: string) =>
    Array.from(text).reduce(
        (width, character) => width + (/[\u4e00-\u9fff]/.test(character) ? 2 : 1),
        0,
    );

const usageTable = (
    rows: Array<{ label: string; usage: DailyTrafficUsage }>,
    labelTitle: string,
    direction: 'total' | 'upload' = 'total',
) => {
    const fields: Array<keyof DailyTrafficUsage> =
        direction === 'upload' ? ['upload', 'download', 'total'] : ['total', 'upload', 'download'];
    const titles = { total: '总量', upload: '上传', download: '下载' };
    const header = [labelTitle, ...fields.map((field) => titles[field])];
    const values = rows.map(({ label, usage }) => [
        label,
        ...fields.map((field) => trafficBytes(usage[field])),
    ]);
    const widths = header.map((title, column) =>
        Math.max(cellWidth(title), ...values.map((row) => cellWidth(row[column]))),
    );
    const line = (row: string[]) =>
        row
            .map((cell, column) => {
                const padding = ' '.repeat(widths[column] - cellWidth(cell));
                return column === 0 ? cell + padding : padding + cell;
            })
            .join(' ');
    return telegramMarkdownPre(
        [
            line(header),
            '-'.repeat(widths.reduce((total, width) => total + width, widths.length - 1)),
            ...values.map(line),
        ].join('\n'),
    );
};

export function renderDailyTrafficReport(
    date: Date,
    summary: DailyTrafficSummary,
    maxCharacters = 4096,
): string {
    const dateText = date.toISOString().slice(0, 10);
    const localStart = new Date(date.getTime() + 8 * 3_600_000)
        .toISOString()
        .slice(5, 16)
        .replace('T', ' ');
    const localEnd = new Date(date.getTime() + 32 * 3_600_000)
        .toISOString()
        .slice(5, 16)
        .replace('T', ' ');
    const summaryRows = [
        { label: '用户', usage: summary.users },
        { label: '节点', usage: summary.nodes },
        { label: 'Host', usage: summary.hosts },
        { label: '转发', usage: summary.forwarding },
    ];
    const render = (maxNameLength: number) => {
        const ranking = (
            title: string,
            rows: Array<DailyTrafficNode | DailyTrafficHost>,
            direction: 'total' | 'upload' = 'total',
        ) => [
            `*${title}*`,
            ...(rows.length
                ? [
                      ...rows.slice(0, 5).map((row, i) => {
                          const host = 'aliasCount' in row ? row : undefined;
                          const context = host
                              ? ` / ${escapeName(host.nodeName, Math.min(maxNameLength, 14))}${host.aliasCount > 1 ? `（共享×${host.aliasCount}）` : ''}`
                              : '';
                          return `${i + 1}\\. *${escapeName(row.name, maxNameLength)}*${context}`;
                      }),
                      usageTable(
                          rows.slice(0, 5).map((row, i) => ({ label: String(i + 1), usage: row })),
                          '#',
                          direction,
                      ),
                  ]
                : ['暂无用量']),
        ];
        const health = summary.health;
        return [
            `*📊 流量日报* · ${telegramMarkdownCode(dateText)}`,
            '统计：UTC 00:00–24:00',
            `北京时间：${telegramMarkdownCode(`${localStart} → ${localEnd}`)}`,
            '↑ 上传  ｜  ↓ 下载',
            '',
            '*🧾 流量汇总*',
            usageTable(summaryRows, '类型'),
            ...summaryRows.flatMap(({ label, usage }) => {
                const unknown = usage.total - usage.upload - usage.download;
                return unknown > 0n ? [`└ ${label}未拆分 ${usageCode(unknown)}`] : [];
            }),
            `活跃用户：${telegramMarkdownCode(String(summary.users.activeUsers))}`,
            ...(summary.userRecordsDisabled ? ['⚠️ 用户记录已停用，统计可能不完整'] : []),
            '',
            ...ranking(
                `🖥 节点用量 Top ${Math.min(summary.topNodes.length, 5) || 5}`,
                summary.topNodes,
            ),
            '',
            ...ranking(
                `🏷 Host 用量 Top ${Math.min(summary.topHosts.length, 5) || 5}`,
                summary.topHosts,
            ),
            '',
            ...ranking('⬆️ 节点上传排行', summary.topUploadNodes.slice(0, 3), 'upload'),
            ...(summary.topForwardingNodes.length
                ? ['', ...ranking('🔀 转发节点排行', summary.topForwardingNodes.slice(0, 3))]
                : []),
            '',
            '*🩺 采集状态（生成时）*',
            `在线：${telegramMarkdownCode(`${health.connected}/${health.enabled}`)}  ｜  积压：${telegramMarkdownCode(String(health.pending))}`,
            ...(health.errors || health.stale || health.pending
                ? [`⚠️ 异常：${health.errors}；15 分钟未入库：${health.stale}，统计可能不完整`]
                : ['✅ 流量采集正常']),
            '',
            '> Host 同入口合并排行，共享别名不重复计量。',
            '> 各口径有重叠，请勿相加；非主机网卡统计。',
        ].join('\n');
    };
    // Keep every section and balanced Markdown; shorten names only for unusually long reports.
    for (const maxNameLength of [35, 24, 16]) {
        const message = render(maxNameLength);
        if (message.length <= maxCharacters || maxNameLength === 16) return message;
    }
    throw new Error('Unable to render daily traffic report');
}
