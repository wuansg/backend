export type TListenerProtocol = 'TCP' | 'UDP' | 'TCP_UDP';

export interface IListenerInbound {
    tag: string;
    type: string;
    network: string | null;
    port: number | null;
    rawInbound?: unknown;
}

export interface IInboundListenerConflict {
    port: number;
    protocol: TListenerProtocol;
    tags: [string, string];
}

const UDP_NETWORKS = new Set(['quic', 'kcp', 'udp']);
const TCP_NETWORKS = new Set(['tcp', 'raw', 'ws', 'grpc', 'httpupgrade', 'splithttp', 'xhttp']);
const UDP_TYPES = new Set(['hysteria', 'hysteria2', 'tuic', 'quic']);
const TCP_TYPES = new Set([
    'snell',
    'anytls',
    'trojan',
    'vless',
    'vmess',
    'http',
    'naive',
    'shadowtls',
]);
const WILDCARD_ADDRESSES = new Set(['', '0.0.0.0', '::', '::0', '[::]']);

function rawString(rawInbound: unknown, key: string): string | null {
    if (!rawInbound || typeof rawInbound !== 'object') return null;
    const value = (rawInbound as Record<string, unknown>)[key];
    return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

/**
 * Transport-layer sockets an inbound listens on. Unknown protocols are treated
 * as both TCP and UDP so that a conflict is reported rather than missed.
 */
export function inboundListenerProtocol(inbound: IListenerInbound): TListenerProtocol {
    // sing-box shadowsocks, naive and direct narrow their sockets with `network`.
    const rawNetwork = rawString(inbound.rawInbound, 'network');
    if (rawNetwork === 'tcp') return 'TCP';
    if (rawNetwork === 'udp') return 'UDP';

    const network = inbound.network?.toLowerCase();
    if (network && UDP_NETWORKS.has(network)) return 'UDP';
    if (network && TCP_NETWORKS.has(network)) return 'TCP';

    const type = inbound.type.toLowerCase();
    if (UDP_TYPES.has(type)) return 'UDP';
    if (TCP_TYPES.has(type)) return 'TCP';
    return 'TCP_UDP';
}

export function listenerProtocolsOverlap(left: string, right: string): boolean {
    return left === 'TCP_UDP' || right === 'TCP_UDP' || left === right;
}

function listenAddressesOverlap(left: IListenerInbound, right: IListenerInbound): boolean {
    const leftAddress = rawString(left.rawInbound, 'listen') ?? '';
    const rightAddress = rawString(right.rawInbound, 'listen') ?? '';
    return (
        WILDCARD_ADDRESSES.has(leftAddress) ||
        WILDCARD_ADDRESSES.has(rightAddress) ||
        leftAddress === rightAddress
    );
}

/**
 * Inbounds that would listen on the same port and transport on one node. The
 * kernel accepts both sockets (SO_REUSEPORT) and spreads new connections across
 * them, so clients of either inbound fail at random instead of failing to start.
 */
export function findInboundListenerConflicts(
    inbounds: readonly IListenerInbound[],
): IInboundListenerConflict[] {
    const conflicts: IInboundListenerConflict[] = [];
    for (let i = 0; i < inbounds.length; i++) {
        const left = inbounds[i];
        if (left.port === null) continue;
        const leftProtocol = inboundListenerProtocol(left);
        for (const right of inbounds.slice(i + 1)) {
            if (right.port !== left.port) continue;
            const rightProtocol = inboundListenerProtocol(right);
            if (!listenerProtocolsOverlap(leftProtocol, rightProtocol)) continue;
            if (!listenAddressesOverlap(left, right)) continue;
            conflicts.push({
                port: left.port,
                // The transport both inbounds actually share.
                protocol: leftProtocol === 'TCP_UDP' ? rightProtocol : leftProtocol,
                tags: [left.tag, right.tag],
            });
        }
    }
    return conflicts;
}

export function describeInboundListenerConflicts(
    conflicts: readonly IInboundListenerConflict[],
): string | null {
    if (conflicts.length === 0) return null;
    return conflicts
        .map(
            (conflict) =>
                `${conflict.protocol}/${conflict.port} is used by both inbound ${conflict.tags[0]} and ${conflict.tags[1]}`,
        )
        .join('; ');
}
