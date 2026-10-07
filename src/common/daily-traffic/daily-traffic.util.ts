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

// Rich Markdown follows GFM, not sendMessage's MarkdownV2 dialect.
// Escape punctuation in names, including table pipes, HTML, links and formulas.
export const escapeRichMarkdown = (text: string) =>
    text.replace(/[\\!"#$%&'()*+,\-./:;<=>?@\[\]^_`{|}~]/g, '\\$&');

export const DAILY_TRAFFIC_PARSE_MODE = 'RichMarkdown' as const;
export const DAILY_TRAFFIC_LAYOUT = 'markdown-tables' as const;

export const countDailyTrafficTables = (message: string) =>
    message.split('\n').filter((line) => /^\| :--- \|(?: :?---:? \|)+$/.test(line)).length;

const escapeName = (name: string, maxLength: number) => {
    const characters = Array.from(name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() || '未命名');
    const clipped =
        characters.length > maxLength
            ? `${characters.slice(0, maxLength - 1).join('')}…`
            : characters.join('');
    return escapeRichMarkdown(clipped);
};

const markdownTable = (headers: string[], rows: string[][], textColumns = 1) =>
    [headers, headers.map((_header, column) => (column < textColumns ? ':---' : '---:')), ...rows]
        .map((row) => `| ${row.join(' | ')} |`)
        .join('\n');

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
        ) => {
            const isHost = rows.length > 0 && 'aliasCount' in rows[0];
            const fields: Array<keyof DailyTrafficUsage> =
                direction === 'upload'
                    ? ['upload', 'download', 'total']
                    : ['total', 'upload', 'download'];
            const titles = { total: '总量', upload: '上传', download: '下载' };
            return [
                `## ${title}`,
                '',
                rows.length
                    ? markdownTable(
                          [
                              ...(isHost ? ['Host', '节点'] : ['节点']),
                              ...fields.map((field) => titles[field]),
                          ],
                          rows.slice(0, 5).map((row) => {
                              const host = 'aliasCount' in row ? row : undefined;
                              return [
                                  `**${escapeName(row.name, maxNameLength)}**`,
                                  ...(isHost
                                      ? [
                                            host
                                                ? `${escapeName(host.nodeName, maxNameLength)}${host.aliasCount > 1 ? `（共享×${host.aliasCount}）` : ''}`
                                                : '—',
                                        ]
                                      : []),
                                  ...fields.map((field) => trafficBytes(row[field])),
                              ];
                          }),
                          isHost ? 2 : 1,
                      )
                    : '暂无用量',
            ];
        };
        const health = summary.health;
        return [
            `# 📊 流量日报 · ${dateText}`,
            '',
            '统计：UTC 00:00–24:00',
            `北京时间：${localStart} → ${localEnd}`,
            '↑ 上传  ｜  ↓ 下载',
            '',
            '## 🧾 流量汇总',
            '',
            markdownTable(
                ['类型', '总量', '上传', '下载'],
                summaryRows.map(({ label, usage }) => [
                    label,
                    trafficBytes(usage.total),
                    trafficBytes(usage.upload),
                    trafficBytes(usage.download),
                ]),
            ),
            '',
            ...summaryRows.flatMap(({ label, usage }) => {
                const unknown = usage.total - usage.upload - usage.download;
                return unknown > 0n ? [`${label}未拆分：**${trafficBytes(unknown)}**`] : [];
            }),
            `活跃用户：**${summary.users.activeUsers}**`,
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
            '## 🩺 采集状态（生成时）',
            '',
            `在线：**${health.connected}/${health.enabled}**  ｜  积压：**${health.pending}**`,
            ...(health.errors || health.stale || health.pending
                ? [`⚠️ 异常：${health.errors}；15 分钟未入库：${health.stale}，统计可能不完整`]
                : ['✅ 流量采集正常']),
            '',
            '> Host 同入口合并排行，共享别名不重复计量。',
            '> 各口径有重叠，请勿相加；非主机网卡统计。',
        ].join('\n');
    };
    // Keep every section and balanced Markdown; shorten names only for unusually long reports.
    for (const maxNameLength of [64, 48, 35, 24, 16]) {
        const message = render(maxNameLength);
        if (message.length <= maxCharacters || maxNameLength === 16) return message;
    }
    throw new Error('Unable to render daily traffic report');
}
