import type { UsageSnapshot, UsageSnapshotCounter } from '@common/axios';

export type UsageDelta = { uplink: bigint; downlink: bigint };

export interface UsageSnapshotWriteBatch {
    nodeHours: Array<{ hour: Date; usage: UsageDelta }>;
    nodeMultipliedTotal: bigint;
    users: Array<{
        userId: bigint;
        upload: bigint;
        download: bigint;
        total: bigint;
        multipliedUpload: bigint;
        multipliedDownload: bigint;
        multipliedTotal: bigint;
        firstCapturedAt: Date;
        lastCapturedAt: Date;
    }>;
    userDays: Array<{ userId: bigint; day: Date; upload: bigint; download: bigint; total: bigint }>;
    hosts: Array<{ tag: string; hour: Date; usage: UsageDelta }>;
    userHosts: Array<{ userId: bigint; tag: string; hour: Date; usage: UsageDelta }>;
    forwardingRules: Array<{
        ruleId: string;
        protocol: 'TCP' | 'UDP';
        hour: Date;
        usage: UsageDelta;
    }>;
}

export function buildUsageSnapshotWriteBatch(
    snapshots: readonly UsageSnapshot[],
    userMultiplier: string,
    nodeMultiplier: string,
): UsageSnapshotWriteBatch {
    const nodeHours = new Map<string, UsageDelta>();
    const users = new Map<
        string,
        {
            upload: bigint;
            download: bigint;
            total: bigint;
            multipliedUpload: bigint;
            multipliedDownload: bigint;
            multipliedTotal: bigint;
            firstCapturedAt: Date;
            lastCapturedAt: Date;
        }
    >();
    const userDays = new Map<string, UsageDelta>();
    const hosts = new Map<string, UsageDelta>();
    const userHosts = new Map<string, UsageDelta>();
    const forwardingRules = new Map<string, UsageDelta>();
    let nodeMultipliedTotal = 0n;

    for (const snapshot of snapshots) {
        const capturedAt = new Date(snapshot.capturedAt);
        const hour = new Date(capturedAt);
        hour.setUTCMinutes(0, 0, 0);
        const day = new Date(capturedAt);
        day.setUTCHours(0, 0, 0, 0);
        const hourKey = hour.toISOString(),
            dayKey = day.toISOString();

        const outbounds = aggregate(
            snapshot.counters.filter((counter) => counter.kind === 'outbound'),
        );
        const nodeUsage = sumUsage(outbounds.values());
        if (nodeUsage.uplink + nodeUsage.downlink > 0n) {
            addUsage(nodeHours, hourKey, nodeUsage);
            nodeMultipliedTotal += multiplyUsage(
                nodeMultiplier,
                nodeUsage.uplink + nodeUsage.downlink,
            );
        }

        for (const [username, usage] of aggregate(
            snapshot.counters.filter((counter) => counter.kind === 'user'),
        )) {
            if (!/^\d+$/.test(username)) continue;
            const total = usage.uplink + usage.downlink;
            if (total === 0n) continue;
            const multipliedTotal = multiplyUsage(userMultiplier, total);
            const multipliedUpload = multiplyUsage(userMultiplier, usage.uplink);
            // Derive the second direction from the multiplied total so integer
            // rounding can never make upload + download differ from the quota total.
            const multipliedDownload = multipliedTotal - multipliedUpload;
            const current = users.get(username);
            if (current) {
                current.upload += usage.uplink;
                current.download += usage.downlink;
                current.total += total;
                current.multipliedUpload += multipliedUpload;
                current.multipliedDownload += multipliedDownload;
                current.multipliedTotal += multipliedTotal;
                if (capturedAt < current.firstCapturedAt) current.firstCapturedAt = capturedAt;
                if (capturedAt > current.lastCapturedAt) current.lastCapturedAt = capturedAt;
            } else {
                users.set(username, {
                    upload: usage.uplink,
                    download: usage.downlink,
                    total,
                    multipliedUpload,
                    multipliedDownload,
                    multipliedTotal,
                    firstCapturedAt: capturedAt,
                    lastCapturedAt: capturedAt,
                });
            }
            const userDayKey = `${username}\u0000${dayKey}`;
            addUsage(userDays, userDayKey, usage);
        }

        for (const [tag, usage] of aggregate(
            snapshot.counters.filter((counter) => counter.kind === 'inbound'),
        )) {
            addUsage(hosts, `${tag}\u0000${hourKey}`, usage);
        }
        for (const [key, usage] of aggregateUserInbounds(snapshot.counters)) {
            const separator = key.indexOf('\u0000');
            const username = key.slice(0, separator),
                tag = key.slice(separator + 1);
            if (tag && /^\d+$/.test(username)) {
                addUsage(userHosts, `${username}\u0000${tag}\u0000${hourKey}`, usage);
            }
        }

        for (const counter of snapshot.counters) {
            if (
                counter.kind !== 'forwarding' ||
                !counter.protocol ||
                !['TCP', 'UDP'].includes(counter.protocol) ||
                !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                    counter.name,
                )
            ) {
                continue;
            }
            addUsage(forwardingRules, `${counter.name}\u0000${counter.protocol}\u0000${hourKey}`, {
                uplink: counter.direction === 'uplink' ? BigInt(counter.value) : 0n,
                downlink: counter.direction === 'downlink' ? BigInt(counter.value) : 0n,
            });
        }
    }

    return {
        nodeHours: [...nodeHours]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([hour, usage]) => ({ hour: new Date(hour), usage })),
        nodeMultipliedTotal,
        users: [...users]
            .sort(([left], [right]) => compareNumericStrings(left, right))
            .map(([userId, usage]) => ({ userId: BigInt(userId), ...usage })),
        userDays: [...userDays]
            .sort(([left], [right]) => compareUserTimeKeys(left, right))
            .map(([key, usage]) => {
                const separator = key.indexOf('\u0000');
                return {
                    userId: BigInt(key.slice(0, separator)),
                    day: new Date(key.slice(separator + 1)),
                    upload: usage.uplink,
                    download: usage.downlink,
                    total: usage.uplink + usage.downlink,
                };
            }),
        hosts: [...hosts]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, usage]) => splitTagTimeUsage(key, usage)),
        userHosts: [...userHosts]
            .sort(([left], [right]) => compareUserTimeKeys(left, right))
            .map(([key, usage]) => {
                const first = key.indexOf('\u0000'),
                    second = key.indexOf('\u0000', first + 1);
                return {
                    userId: BigInt(key.slice(0, first)),
                    tag: key.slice(first + 1, second),
                    hour: new Date(key.slice(second + 1)),
                    usage,
                };
            }),
        forwardingRules: [...forwardingRules]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, usage]) => {
                const first = key.indexOf('\u0000');
                const second = key.indexOf('\u0000', first + 1);
                return {
                    ruleId: key.slice(0, first),
                    protocol: key.slice(first + 1, second) as 'TCP' | 'UDP',
                    hour: new Date(key.slice(second + 1)),
                    usage,
                };
            }),
    };
}

function aggregate(counters: readonly UsageSnapshotCounter[]): Map<string, UsageDelta> {
    const result = new Map<string, UsageDelta>();
    for (const counter of counters) {
        const usage = result.get(counter.name) ?? { uplink: 0n, downlink: 0n };
        usage[counter.direction] += BigInt(counter.value);
        result.set(counter.name, usage);
    }
    return result;
}

function aggregateUserInbounds(counters: readonly UsageSnapshotCounter[]): Map<string, UsageDelta> {
    const result = new Map<string, UsageDelta>();
    for (const counter of counters) {
        if (counter.kind !== 'user' || !counter.inbound) continue;
        addUsage(result, `${counter.name}\u0000${counter.inbound}`, {
            uplink: counter.direction === 'uplink' ? BigInt(counter.value) : 0n,
            downlink: counter.direction === 'downlink' ? BigInt(counter.value) : 0n,
        });
    }
    return result;
}

function addUsage(target: Map<string, UsageDelta>, key: string, delta: UsageDelta): void {
    const usage = target.get(key) ?? { uplink: 0n, downlink: 0n };
    usage.uplink += delta.uplink;
    usage.downlink += delta.downlink;
    target.set(key, usage);
}

function sumUsage(items: Iterable<UsageDelta>): UsageDelta {
    const result = { uplink: 0n, downlink: 0n };
    for (const usage of items) {
        result.uplink += usage.uplink;
        result.downlink += usage.downlink;
    }
    return result;
}

function multiplyUsage(multiplier: string, bytes: bigint): bigint {
    return (BigInt(multiplier) * bytes) / 1_000_000_000n;
}

function compareNumericStrings(left: string, right: string): number {
    const leftId = BigInt(left),
        rightId = BigInt(right);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function compareUserTimeKeys(left: string, right: string): number {
    const leftSeparator = left.indexOf('\u0000'),
        rightSeparator = right.indexOf('\u0000');
    const userComparison = compareNumericStrings(
        left.slice(0, leftSeparator),
        right.slice(0, rightSeparator),
    );
    return (
        userComparison ||
        left.slice(leftSeparator + 1).localeCompare(right.slice(rightSeparator + 1))
    );
}

function splitTagTimeUsage(key: string, usage: UsageDelta) {
    const separator = key.lastIndexOf('\u0000');
    return {
        tag: key.slice(0, separator),
        hour: new Date(key.slice(separator + 1)),
        usage,
    };
}
