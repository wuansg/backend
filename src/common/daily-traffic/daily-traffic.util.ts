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

const escapeName = (name: string, maxLength: number) => {
    const characters = Array.from(name.replace(/[\u0000-\u001f\u007f]/g, ' '));
    const clipped =
        characters.length > maxLength
            ? `${characters.slice(0, maxLength - 1).join('')}…`
            : characters.join('');
    return clipped.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

const usageLines = (title: string, usage: DailyTrafficUsage) => {
    const lines = [
        `${title}  <b>${trafficBytes(usage.total)}</b>`,
        `↑ ${trafficBytes(usage.upload)}  ｜  ↓ ${trafficBytes(usage.download)}`,
    ];
    const unknown = usage.total - usage.upload - usage.download;
    if (unknown > 0n) lines.push(`└ 未拆分 ${trafficBytes(unknown)}`);
    return lines;
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
    const render = (maxNameLength: number) => {
        const ranking = (
            title: string,
            rows: Array<DailyTrafficNode | DailyTrafficHost>,
            direction: 'total' | 'upload' = 'total',
        ) => [
            `<b>${title}</b>`,
            ...(rows.length
                ? rows.slice(0, 5).map((row, i) => {
                      const host = 'aliasCount' in row ? row : undefined;
                      const context = host
                          ? ` / ${escapeName(host.nodeName, Math.min(maxNameLength, 14))}${host.aliasCount > 1 ? `（共享×${host.aliasCount}）` : ''}`
                          : '';
                      const details =
                          direction === 'upload'
                              ? `↓ ${trafficBytes(row.download)}  ｜  总 ${trafficBytes(row.total)}`
                              : `↑ ${trafficBytes(row.upload)}  ｜  ↓ ${trafficBytes(row.download)}`;
                      return `${i + 1}. <b>${escapeName(row.name, maxNameLength)}</b>${context} · <b>${trafficBytes(row[direction])}</b>\n   ${details}`;
                  })
                : ['暂无用量']),
        ];
        const health = summary.health;
        return [
            `<b>📊 流量日报 · ${dateText}</b>`,
            '统计：UTC 00:00–24:00',
            `北京时间：${localStart} → ${localEnd}`,
            '↑ 上传  ｜  ↓ 下载',
            '',
            '<b>🧾 流量汇总</b>',
            ...usageLines('👤 用户消耗', summary.users),
            `活跃用户：${summary.users.activeUsers}`,
            ...(summary.userRecordsDisabled ? ['⚠️ 用户记录已停用，统计可能不完整'] : []),
            '',
            ...usageLines('🖥 节点代理', summary.nodes),
            '',
            ...usageLines('🏷 Host 入口', summary.hosts),
            '',
            ...usageLines('🔀 nft 转发', summary.forwarding),
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
            '<b>🩺 采集状态（生成时）</b>',
            `在线：${health.connected}/${health.enabled}  ｜  积压：${health.pending}`,
            ...(health.errors || health.stale || health.pending
                ? [`⚠️ 异常：${health.errors}；15 分钟未入库：${health.stale}，统计可能不完整`]
                : ['✅ 流量采集正常']),
            '',
            'Host 同入口合并排行，共享别名不重复计量。',
            '各口径有重叠，请勿相加；非主机网卡统计。',
        ].join('\n');
    };
    // Keep every section and balanced HTML; shorten names only for unusually long reports.
    for (const maxNameLength of [35, 24, 16]) {
        const message = render(maxNameLength);
        if (message.length <= maxCharacters || maxNameLength === 16) return message;
    }
    throw new Error('Unable to render daily traffic report');
}
