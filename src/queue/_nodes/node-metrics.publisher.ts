import { Injectable } from '@nestjs/common';

import { UsageSnapshot } from '@common/axios';
import { RawCacheService } from '@common/raw-cache';

import {
    INodeMetrics,
    NODE_METRICS_MESSAGE_CHANNEL,
} from '@scheduler/tasks/export-metrics/node-metrics.message.interface';

type DirectionMetrics = { downlink: bigint; uplink: bigint };

@Injectable()
export class NodeMetricsPublisher {
    constructor(private readonly rawCacheService: RawCacheService) {}

    public publish(metrics: INodeMetrics): void {
        this.rawCacheService.publishSafe(NODE_METRICS_MESSAGE_CHANNEL, metrics);
    }
}

export function buildNodeMetricsFromSnapshots(
    nodeUuid: string,
    snapshots: UsageSnapshot[],
): INodeMetrics | null {
    const inbounds = new Map<string, DirectionMetrics>();
    const outbounds = new Map<string, DirectionMetrics>();
    let total = 0n;

    for (const snapshot of snapshots) {
        for (const counter of snapshot.counters) {
            if (counter.kind === 'user') continue;

            const value = BigInt(counter.value);
            total += value;

            const target = counter.kind === 'inbound' ? inbounds : outbounds;
            const metrics = target.get(counter.name) ?? { downlink: 0n, uplink: 0n };
            metrics[counter.direction] += value;
            target.set(counter.name, metrics);
        }
    }

    if (total === 0n) return null;

    return {
        nodeUuid,
        inbounds: serializeMetrics(inbounds),
        outbounds: serializeMetrics(outbounds),
    };
}

function serializeMetrics(metrics: Map<string, DirectionMetrics>) {
    return Array.from(metrics.entries()).map(([tag, value]) => ({
        tag,
        downlink: value.downlink.toString(),
        uplink: value.uplink.toString(),
    }));
}
