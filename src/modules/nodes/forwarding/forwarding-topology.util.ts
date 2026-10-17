import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';

import { ForwardingTopology, TopologyUsage } from '@libs/contracts/commands';
import { NodeForwardingConfigSchema } from '@libs/contracts/models';

import { hashNodeForwardingConfig } from '@queue/_nodes/forwarding-sync.util';

export interface TopologyInboundInput {
    uuid: string;
    tag: string;
    type: string;
    port: number | null;
    network: string | null;
}
export interface TopologyNodeInput {
    uuid: string;
    name: string;
    address: string;
    countryCode: string;
    provider: { name: string } | null;
    isConnected: boolean;
    isDisabled: boolean;
    forwardingConfig: unknown;
    isTrafficTrackingActive: boolean;
    trafficUsedBytes: bigint | null;
    trafficLimitBytes: bigint | null;
    trafficResetDay: number | null;
    runtimeInventory: { runtimeStatus: unknown; reportedAt: Date } | null;
    networkInventory: { interfaces: unknown; reportedAt: Date } | null;
    configState: { requestedSeq: bigint; processedSeq: bigint; blocked: boolean } | null;
    usageSnapshotState: {
        lastSuccessAt: Date | null;
        pending: number;
        receivedThrough: bigint;
        appliedThrough: bigint;
        lastError: string | null;
    } | null;
    configProfileInboundsToNodes: { configProfileInbounds: TopologyInboundInput }[];
    geocheckHistory: { snapshot: unknown; createdAt: Date; sourceType: string }[];
}
export interface TopologyHostInput {
    uuid: string;
    remark: string;
    address: string;
    port: number;
    isDisabled: boolean;
    configProfileInboundUuid: string | null;
    configProfileInbounds: TopologyInboundInput | null;
    nodes: { nodeUuid: string }[];
}
export interface TopologyUsageRow {
    nodeUuid: string;
    ruleId?: string;
    hostUuid?: string;
    protocol?: string;
    upload: string;
    download: string;
    total: string;
    lastRecordedAt: Date | null;
    shared?: boolean;
}

const object = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const iso = (v: Date | null | undefined) => v?.toISOString() ?? null;
export const emptyTopologyUsage = (): TopologyUsage => ({
    upload: '0',
    download: '0',
    total: '0',
    lastRecordedAt: null,
    shared: false,
});
export function addTopologyUsage(left: TopologyUsage, right: TopologyUsage): TopologyUsage {
    return {
        upload: String(BigInt(left.upload) + BigInt(right.upload)),
        download: String(BigInt(left.download) + BigInt(right.download)),
        total: String(BigInt(left.total) + BigInt(right.total)),
        lastRecordedAt:
            [left.lastRecordedAt, right.lastRecordedAt]
                .filter((v): v is string => !!v)
                .sort()
                .at(-1) ?? null,
        shared: left.shared || right.shared,
    };
}
function usage(row: TopologyUsageRow): TopologyUsage {
    return {
        upload: row.upload,
        download: row.download,
        total: row.total,
        lastRecordedAt: iso(row.lastRecordedAt),
        shared: row.shared ?? false,
    };
}
export function normalizeTopologyAddress(value: string): string {
    let text = value.trim().toLowerCase().replace(/\.$/, '');
    if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
    // Zone identifiers are interface-local, not a cross-node identity or a valid URL host.
    if (text.includes('%')) return '';
    if (isIP(text) === 6) return new URL(`http://[${text}]/`).hostname.slice(1, -1);
    if (isIP(text) === 4) return text;
    if (!text || /[\s/:@?#%]/.test(text)) return '';
    return domainToASCII(text);
}
export function topologyTransport(
    inbound: TopologyInboundInput,
): 'TCP' | 'UDP' | 'TCP_UDP' | 'UNKNOWN' {
    const network = inbound.network?.toLowerCase();
    if (network === 'tcp') return 'TCP';
    if (network === 'udp') return 'UDP';
    if (network === 'tcp,udp' || network === 'udp,tcp') return 'TCP_UDP';
    if (
        ['anytls', 'trojan', 'vless', 'http', 'naive', 'shadowtls'].includes(
            inbound.type.toLowerCase(),
        )
    )
        return 'TCP';
    if (['hysteria', 'hysteria2', 'tuic', 'quic'].includes(inbound.type.toLowerCase()))
        return 'UDP';
    // Do not guess QUIC options or transport behavior of an unrecognized core protocol.
    return 'UNKNOWN';
}

export function buildForwardingTopology(input: {
    nodes: TopologyNodeInput[];
    hosts: TopologyHostInput[];
    forwardingUsage: TopologyUsageRow[];
    coreUsage: TopologyUsageRow[];
    hostUsage: TopologyUsageRow[];
    start: string;
    end: string;
    now: Date;
}): ForwardingTopology {
    const identities = new Map<string, Set<string>>();
    const addIdentity = (address: string, uuid: string) => {
        const key = normalizeTopologyAddress(address);
        if (
            !key ||
            key === 'localhost' ||
            key === '::1' ||
            key === '::' ||
            key.startsWith('127.') ||
            key === '0.0.0.0'
        )
            return;
        if (!identities.has(key)) identities.set(key, new Set());
        identities.get(key)!.add(uuid);
    };
    const fresh = (at: Date | null | undefined) =>
        !!at && Math.abs(input.now.getTime() - at.getTime()) <= 120000;
    for (const n of input.nodes) {
        addIdentity(n.address, n.uuid);
        // Interface observations, not egress-IP geolocation or user/client IP lists.
        if (fresh(n.networkInventory?.reportedAt) && Array.isArray(n.networkInventory?.interfaces))
            for (const raw of n.networkInventory.interfaces) {
                const addresses = object(raw).addresses;
                if (Array.isArray(addresses))
                    for (const item of addresses) {
                        const address = object(item).address;
                        if (typeof address === 'string' && isIP(address))
                            addIdentity(address, n.uuid);
                    }
            }
    }
    const match = (address: string, resolved: string | null) => {
        const configured = identities.get(normalizeTopologyAddress(address));
        const observed = resolved ? identities.get(normalizeTopologyAddress(resolved)) : undefined;
        const candidates = [...new Set([...(configured ?? []), ...(observed ?? [])])].sort();
        const by: 'ADDRESS' | 'DNS' | 'AMBIGUOUS' | 'NONE' =
            candidates.length > 1
                ? 'AMBIGUOUS'
                : configured?.size
                  ? 'ADDRESS'
                  : observed?.size
                    ? 'DNS'
                    : 'NONE';
        return { candidates, by };
    };
    const core = new Map(input.coreUsage.map((r) => [r.nodeUuid, usage(r)]));
    const hostsUsage = new Map(input.hostUsage.map((r) => [r.hostUuid!, usage(r)]));
    const ruleUsage = new Map<string, TopologyUsage>();
    const protocols = new Map<string, { protocol: 'TCP' | 'UDP'; usage: TopologyUsage }[]>();
    for (const r of input.forwardingUsage) {
        if (!['TCP', 'UDP'].includes(r.protocol ?? '')) continue;
        const key = `${r.nodeUuid}:${r.ruleId}`;
        ruleUsage.set(key, addTopologyUsage(ruleUsage.get(key) ?? emptyTopologyUsage(), usage(r)));
        if (!protocols.has(key)) protocols.set(key, []);
        protocols.get(key)!.push({ protocol: r.protocol as 'TCP' | 'UDP', usage: usage(r) });
    }
    const result: ForwardingTopology = {
        generatedAt: input.now.toISOString(),
        start: input.start,
        end: input.end,
        nodes: [],
        rules: [],
        hosts: [],
        orphanUsage: [],
    };
    const observedDns = new Map<string, Set<string>>();
    for (const n of input.nodes) {
        const runtime = object(n.runtimeInventory?.runtimeStatus);
        const forwarding = object(runtime.forwarding);
        const parsed = NodeForwardingConfigSchema.safeParse(n.forwardingConfig);
        const reportedAt = n.runtimeInventory?.reportedAt ?? null;
        const stale = !fresh(reportedAt);
        const hashMatches =
            parsed.success &&
            typeof forwarding.configHash === 'string' &&
            forwarding.configHash === hashNodeForwardingConfig(parsed.data);
        const dns = object(forwarding.dnsResults);
        const lastDns =
            typeof forwarding.dnsLastResolvedAt === 'string'
                ? new Date(forwarding.dnsLastResolvedAt)
                : null;
        const dnsReportedAt = lastDns && Number.isFinite(lastDns.getTime()) ? lastDns : null;
        const geo = n.geocheckHistory[0];
        const snapshot = object(geo?.snapshot);
        const text = (v: unknown) => (typeof v === 'string' ? v : null);
        result.nodes.push({
            uuid: n.uuid,
            name: n.name,
            address: n.address,
            countryCode: n.countryCode,
            provider: n.provider?.name ?? null,
            connected: n.isConnected,
            disabled: n.isDisabled,
            mode: typeof runtime.mode === 'string' ? runtime.mode : 'UNKNOWN',
            coreOnline: runtime.coreOnline === true,
            reportedAt: iso(reportedAt),
            stale,
            configPending:
                !!n.configState && n.configState.requestedSeq > n.configState.processedSeq,
            configBlocked: n.configState?.blocked ?? false,
            forwardingState: typeof forwarding.state === 'string' ? forwarding.state : 'unknown',
            configValid: parsed.success,
            hashMatches,
            dnsStale: forwarding.dnsStale === true,
            dnsReportedAt: iso(dnsReportedAt),
            inbounds: n.configProfileInboundsToNodes.map(({ configProfileInbounds: i }) => ({
                uuid: i.uuid,
                tag: i.tag,
                protocol: i.type,
                port: i.port,
                transport: topologyTransport(i),
            })),
            quota: {
                tracking: n.isTrafficTrackingActive,
                used: String(n.trafficUsedBytes ?? 0n),
                limit: String(n.trafficLimitBytes ?? 0n),
                resetDay: n.trafficResetDay,
            },
            coreUsage: core.get(n.uuid) ?? emptyTopologyUsage(),
            snapshot: n.usageSnapshotState
                ? {
                      lastSuccessAt: iso(n.usageSnapshotState.lastSuccessAt),
                      pending: String(n.usageSnapshotState.pending),
                      error: !!n.usageSnapshotState.lastError,
                      gap: String(
                          n.usageSnapshotState.receivedThrough -
                              n.usageSnapshotState.appliedThrough,
                      ),
                  }
                : null,
            exitObservation: geo
                ? {
                      ip: text(snapshot.exitIp),
                      asn: text(snapshot.asn),
                      country: text(snapshot.country),
                      observedAt: geo.createdAt.toISOString(),
                      sourceType: geo.sourceType,
                  }
                : null,
        });
        if (!parsed.success) continue;
        for (const rule of parsed.data.rules) {
            const key = `${n.uuid}:${rule.id}`;
            const literal = isIP(rule.targetAddress) !== 0;
            const observed =
                typeof dns[rule.id] === 'string' && isIP(dns[rule.id] as string)
                    ? (dns[rule.id] as string)
                    : null;
            // Never associate an old ruleset's resolution with a changed desired target.
            const resolved = literal ? rule.targetAddress : hashMatches ? observed : null;
            const resolution = literal
                ? 'LITERAL'
                : !resolved
                  ? 'MISSING'
                  : stale || forwarding.dnsStale === true
                    ? 'STALE'
                    : 'OBSERVED';
            const target = match(rule.targetAddress, resolved);
            const enabled = parsed.data.enabled && rule.enabled;
            const state =
                !enabled || n.isDisabled
                    ? 'DISABLED'
                    : !n.isConnected
                      ? 'OFFLINE'
                      : !reportedAt
                        ? 'UNREPORTED'
                        : stale
                          ? 'STALE'
                          : !hashMatches
                            ? 'PENDING'
                            : forwarding.state === 'applied' && forwarding.dnsStale !== true
                              ? 'APPLIED'
                              : forwarding.state === 'degraded' || forwarding.dnsStale === true
                                ? 'DEGRADED'
                                : 'ERROR';
            result.rules.push({
                key,
                id: rule.id,
                nodeUuid: n.uuid,
                name: rule.name,
                enabled,
                protocol: rule.protocol,
                listenPort: rule.listenPort,
                targetAddress: rule.targetAddress,
                targetPort: rule.targetPort,
                resolvedTargetAddress: resolved,
                resolution,
                targetNodeUuids: target.candidates,
                targetMatch: target.by,
                state,
                usage: ruleUsage.get(key) ?? emptyTopologyUsage(),
                protocols: protocols.get(key) ?? [],
            });
            ruleUsage.delete(key);
            if (
                !literal &&
                resolved &&
                resolution === 'OBSERVED' &&
                enabled &&
                n.isConnected &&
                !n.isDisabled
            ) {
                const name = normalizeTopologyAddress(rule.targetAddress);
                if (!observedDns.has(name)) observedDns.set(name, new Set());
                observedDns.get(name)!.add(resolved);
            }
        }
    }
    for (const h of input.hosts) {
        const address = normalizeTopologyAddress(h.address);
        const direct = match(h.address, null);
        const candidates = new Set(direct.candidates);
        for (const ip of observedDns.get(address) ?? [])
            for (const id of match(ip, null).candidates) candidates.add(id);
        const entries = [...candidates].sort();
        result.hosts.push({
            uuid: h.uuid,
            remark: h.remark,
            address: h.address,
            port: h.port,
            disabled: h.isDisabled,
            protocol: h.configProfileInbounds?.type ?? null,
            transport: h.configProfileInbounds
                ? topologyTransport(h.configProfileInbounds)
                : 'UNKNOWN',
            inboundUuid: h.configProfileInboundUuid,
            boundNodeUuids: h.nodes.map((n) => n.nodeUuid).sort(),
            entryNodeUuids: entries,
            entryMatch:
                entries.length > 1
                    ? 'AMBIGUOUS'
                    : direct.candidates.length
                      ? 'ADDRESS'
                      : entries.length
                        ? 'DNS'
                        : 'NONE',
            usage: hostsUsage.get(h.uuid) ?? emptyTopologyUsage(),
        });
    }
    for (const [key, value] of ruleUsage) {
        const [nodeUuid, ruleId] = key.split(':');
        result.orphanUsage.push({ nodeUuid, ruleId, usage: value });
    }
    return result;
}
