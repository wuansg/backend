import assert from 'node:assert/strict';

import { parseResolvedProxyRemark } from '@modules/subscription-template/resolve-proxy/utils';

const resolvedProxy = {
    finalRemark: 'resolved remark',
    address: '203.0.113.10',
    port: 443,
    protocol: 'vless',
    protocolOptions: {
        id: '00000000-0000-4000-8000-000000000001',
        encryption: 'none',
        flow: '',
    },
    transport: 'tcp',
    transportOptions: { header: null },
    security: 'none',
    streamOverrides: { finalMask: null, sockopt: null },
    mux: null,
    clientOverrides: {
        shuffleHost: false,
        mihomoX25519: false,
        mihomoIpVersion: null,
        serverDescription: null,
        xrayJsonTemplate: null,
        mapper: {},
    },
    metadata: {
        uuid: '00000000-0000-4000-8000-000000000002',
        tags: [],
        excludeFromSubscriptionTypes: [],
        inboundTag: 'vless-in',
        configProfileUuid: null,
        configProfileInboundUuid: null,
        isDisabled: false,
        isHidden: false,
        viewPosition: 0,
        remark: 'resolved remark',
        vlessRouteId: null,
        rawInbound: null,
    },
};

assert.deepEqual(parseResolvedProxyRemark('ordinary remark'), { kind: 'plain' });
assert.deepEqual(parseResolvedProxyRemark('{ordinary remark}'), { kind: 'plain' });
assert.deepEqual(parseResolvedProxyRemark('{"note":"ordinary JSON remark"}'), { kind: 'plain' });
assert.deepEqual(parseResolvedProxyRemark('[{"finalRemark":"not an object"}]'), { kind: 'plain' });

const valid = parseResolvedProxyRemark(`  ${JSON.stringify(resolvedProxy)}  `);
assert.equal(valid.kind, 'resolved');
if (valid.kind === 'resolved') {
    assert.equal(valid.config.finalRemark, 'resolved remark');
    assert.equal(valid.config.protocol, 'vless');
}

assert.equal(parseResolvedProxyRemark('{"finalRemark":').kind, 'invalid');
assert.equal(
    parseResolvedProxyRemark(JSON.stringify({ finalRemark: 'missing internal fields' })).kind,
    'invalid',
);

process.stdout.write('subscription custom remark classification passed\n');
