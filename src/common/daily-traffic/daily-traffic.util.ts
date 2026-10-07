export interface DailyTrafficUsage {
    upload: bigint;
    download: bigint;
    total: bigint;
}

export interface DailyTrafficNode extends DailyTrafficUsage {
    name: string;
    uuid: string;
}

export interface DailyTrafficSummary {
    nodes: DailyTrafficUsage;
    users: DailyTrafficUsage & { activeUsers: number };
    hosts: DailyTrafficUsage;
    forwarding: DailyTrafficUsage;
    topNodes: DailyTrafficNode[];
    topUploadNodes: DailyTrafficNode[];
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

const escapeName = (name: string) =>
    Array.from(name.replace(/[\u0000-\u001f\u007f]/g, ' '))
        .slice(0, 35)
        .join('')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

const usageLines = (title: string, usage: DailyTrafficUsage) => {
    const lines = [
        `<b>${title}</b>`,
        `↑ 上传 ${trafficBytes(usage.upload)}  ↓ 下载 ${trafficBytes(usage.download)}`,
        `总量 ${trafficBytes(usage.total)}`,
    ];
    const unknown = usage.total - usage.upload - usage.download;
    if (unknown > 0n) lines.push(`其中未拆分 ${trafficBytes(unknown)}`);
    return lines;
};

export function renderDailyTrafficReport(date: Date, summary: DailyTrafficSummary): string {
    const ranking = (title: string, rows: DailyTrafficNode[]) => [
        `<b>${title}</b>`,
        ...(rows.length
            ? rows
                  .slice(0, 5)
                  .map(
                      (row, i) =>
                          `${i + 1}. ${escapeName(row.name)}\n   ${trafficBytes(row.total)} · ↑${trafficBytes(row.upload)} ↓${trafficBytes(row.download)}`,
                  )
            : ['无流量记录']),
    ];
    const health = summary.health;
    return [
        '<b>📊 Remnawave 每日流量统计</b>',
        `${date.toISOString().slice(0, 10)} 00:00–24:00 UTC`,
        '',
        ...usageLines('用户消耗', summary.users),
        `活跃用户 ${summary.users.activeUsers}`,
        ...(summary.userRecordsDisabled ? ['⚠️ 用户流量记录已停用，此项可能不完整'] : []),
        '',
        ...usageLines('节点代理流量（outbound）', summary.nodes),
        '',
        ...usageLines('Host 入口流量（共享入口已去重）', summary.hosts),
        '',
        ...usageLines('nft 转发流量（独立口径）', summary.forwarding),
        '',
        ...ranking('节点总流量排行', summary.topNodes),
        '',
        ...ranking('节点上传排行', summary.topUploadNodes.slice(0, 3)),
        ...(summary.topForwardingNodes.length
            ? ['', ...ranking('转发节点排行', summary.topForwardingNodes.slice(0, 3))]
            : []),
        '',
        `生成时节点在线 ${health.connected}/${health.enabled}；积压快照 ${health.pending}`,
        ...(health.errors || health.stale || health.pending
            ? [`⚠️ 采集异常节点 ${health.errors}；15 分钟未入库 ${health.stale}，统计可能不完整`]
            : []),
        '口径有重叠，不相加；不含主机网卡/测速流量。',
    ].join('\n');
}
