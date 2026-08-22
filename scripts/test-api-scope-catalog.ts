import assert from 'node:assert/strict';

import * as commandExports from '@libs/contracts/commands';
import { EndpointDetails } from '@libs/contracts/constants';

interface EndpointCommand {
    endpointDetails: EndpointDetails;
    url: string;
}

const endpointScopes = new Map<string, string>();
let endpointCount = 0;

for (const [exportName, candidate] of Object.entries(commandExports)) {
    if ((typeof candidate !== 'object' && typeof candidate !== 'function') || !candidate) {
        continue;
    }

    const endpoint = candidate as Partial<EndpointCommand>;
    if (!endpoint.endpointDetails?.SCOPE || typeof endpoint.url !== 'string') continue;

    const pathSegments = endpoint.url.split('/').filter(Boolean);
    const controller = pathSegments[0] === 'api' ? pathSegments[1] : pathSegments[0];

    assert.ok(controller, `${exportName} does not expose a controller URL.`);

    const scopeKey = `${controller}:${endpoint.endpointDetails.SCOPE}`;
    const existing = endpointScopes.get(scopeKey);

    assert.equal(
        existing,
        undefined,
        `Duplicate API token scope "${scopeKey}" in ${existing} and ${exportName}`,
    );

    endpointScopes.set(scopeKey, exportName);
    endpointCount++;
}

assert.ok(
    endpointCount > 120,
    `Expected to validate all exported endpoint commands, found ${endpointCount}.`,
);
process.stdout.write(
    `API scope catalog uniqueness validation passed (${endpointCount} endpoints)\n`,
);
