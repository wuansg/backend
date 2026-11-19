import assert from 'node:assert/strict';

import {
    describeInboundListenerConflicts,
    findInboundListenerConflicts,
    IListenerInbound,
    inboundListenerProtocol,
} from '../src/modules/nodes/inbound-listener-conflicts.util';

const inbound = (
    tag: string,
    type: string,
    port: number | null,
    raw: Record<string, unknown> = { listen: '0.0.0.0' },
): IListenerInbound => ({ tag, type, network: null, port, rawInbound: raw });

// sing-box profiles store network as null; the transport comes from the type.
assert.equal(inboundListenerProtocol(inbound('a', 'trojan', 1)), 'TCP');
assert.equal(inboundListenerProtocol(inbound('a', 'vmess', 1)), 'TCP');
assert.equal(inboundListenerProtocol(inbound('a', 'hysteria2', 1)), 'UDP');
assert.equal(inboundListenerProtocol(inbound('a', 'shadowsocks', 1)), 'TCP_UDP');
assert.equal(inboundListenerProtocol(inbound('a', 'shadowsocks', 1, { network: 'udp' })), 'UDP');
assert.equal(inboundListenerProtocol(inbound('a', 'naive', 1, { network: 'udp' })), 'UDP');
assert.equal(inboundListenerProtocol(inbound('a', 'unknown-core', 1)), 'TCP_UDP');

// The CloudSilk incident: trojan+ws and trojan+tls on the same TCP port.
let conflicts = findInboundListenerConflicts([
    inbound('SB_Trojan_WS_54320', 'trojan', 54320),
    inbound('SB_Trojan_TCP_TLS_54320', 'trojan', 54320),
]);
assert.deepEqual(conflicts, [
    { port: 54320, protocol: 'TCP', tags: ['SB_Trojan_WS_54320', 'SB_Trojan_TCP_TLS_54320'] },
]);
assert.equal(
    describeInboundListenerConflicts(conflicts),
    'TCP/54320 is used by both inbound SB_Trojan_WS_54320 and SB_Trojan_TCP_TLS_54320',
);

// TCP and UDP on the same port coexist (e.g. trojan and hysteria2 on 443).
assert.deepEqual(
    findInboundListenerConflicts([
        inbound('trojan', 'trojan', 443),
        inbound('hy2', 'hysteria2', 443),
    ]),
    [],
);

// Shadowsocks listens on both, so it collides with either side and reports the shared one.
assert.deepEqual(
    findInboundListenerConflicts([
        inbound('ss', 'shadowsocks', 8388),
        inbound('hy2', 'tuic', 8388),
    ]),
    [{ port: 8388, protocol: 'UDP', tags: ['ss', 'hy2'] }],
);
assert.deepEqual(
    findInboundListenerConflicts([
        inbound('ss', 'shadowsocks', 8388, { network: 'udp' }),
        inbound('trojan', 'trojan', 8388),
    ]),
    [],
);

// Different ports, or no port at all, never conflict.
assert.deepEqual(
    findInboundListenerConflicts([
        inbound('a', 'trojan', 443),
        inbound('b', 'trojan', 8443),
        inbound('tun', 'tun', null),
        inbound('tun2', 'tun', null),
    ]),
    [],
);

// Listen addresses: distinct specific addresses are fine, a wildcard overlaps everything.
assert.deepEqual(
    findInboundListenerConflicts([
        inbound('a', 'trojan', 443, { listen: '10.0.0.1' }),
        inbound('b', 'trojan', 443, { listen: '10.0.0.2' }),
    ]),
    [],
);
assert.equal(
    findInboundListenerConflicts([
        inbound('a', 'trojan', 443, { listen: '10.0.0.1' }),
        inbound('b', 'trojan', 443, { listen: '::' }),
    ]).length,
    1,
);
assert.equal(
    findInboundListenerConflicts([
        inbound('a', 'trojan', 443, { listen: '10.0.0.1' }),
        inbound('b', 'trojan', 443, {}),
    ]).length,
    1,
);
assert.equal(
    findInboundListenerConflicts([
        inbound('a', 'trojan', 443, { listen: '10.0.0.1' }),
        inbound('b', 'anytls', 443, { listen: '10.0.0.1' }),
    ]).length,
    1,
);

// Every pair is reported, so three inbounds on one port give three conflicts.
conflicts = findInboundListenerConflicts([
    inbound('a', 'trojan', 443),
    inbound('b', 'vless', 443),
    inbound('c', 'anytls', 443),
]);
assert.equal(conflicts.length, 3);
assert.equal(describeInboundListenerConflicts([]), null);

console.log('Inbound port conflict tests passed');
