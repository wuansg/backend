import assert from 'node:assert/strict';

import { formatNodeApiSni } from './node-api-sni.util';

const serverName = formatNodeApiSni(Buffer.from([1, 2]), Buffer.from([3, 4]));

assert.equal(
    serverName,
    'rw-9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a.node.invalid',
);
assert.equal(serverName.length, 80);

console.log('node-api-sni.util: 2 tests passed');
