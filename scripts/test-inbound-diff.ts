import assert from 'node:assert/strict';

import { diffInbounds } from '@common/utils/inbounds';

interface ExistingInbound {
    network: string;
    port: number;
    rawInbound: object;
    security: string;
    tag: string;
    type: string;
    uuid: string;
}

function main(): void {
    const existing: ExistingInbound[] = [
        {
            uuid: 'keep-uuid',
            tag: 'keep',
            type: 'vless',
            network: 'tcp',
            security: 'tls',
            port: 443,
            rawInbound: { tag: 'keep', value: 1 },
        },
        {
            uuid: 'replace-uuid',
            tag: 'replace',
            type: 'vless',
            network: 'tcp',
            security: 'none',
            port: 80,
            rawInbound: { tag: 'replace' },
        },
        {
            uuid: 'remove-uuid',
            tag: 'remove',
            type: 'trojan',
            network: 'tcp',
            security: 'tls',
            port: 443,
            rawInbound: { tag: 'remove' },
        },
    ];

    const incoming = [
        {
            tag: 'keep',
            type: 'vless',
            network: 'ws',
            security: 'tls',
            port: 8443,
            rawInbound: { tag: 'keep', value: 2 },
        },
        {
            tag: 'replace',
            type: 'anytls',
            network: 'tcp',
            security: 'tls',
            port: 443,
            rawInbound: { tag: 'replace', type: 'anytls' },
        },
        {
            tag: 'add',
            type: 'hysteria2',
            network: 'udp',
            security: 'tls',
            port: 8443,
            rawInbound: { tag: 'add' },
        },
    ];

    const result = diffInbounds(existing, incoming);

    assert.deepEqual(result.toRemove.map((item) => item.uuid).sort(), [
        'remove-uuid',
        'replace-uuid',
    ]);
    assert.deepEqual(result.toAdd.map((item) => item.tag).sort(), ['add', 'replace']);
    assert.equal(result.toUpdate.length, 1);
    assert.deepEqual(result.toUpdate[0], {
        ...incoming[0],
        uuid: 'keep-uuid',
    });

    process.stdout.write('simultaneous inbound diff validation passed\n');
}

main();
