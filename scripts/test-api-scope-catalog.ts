import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import * as commandExports from '@libs/contracts/commands';
import { EndpointDetails } from '@libs/contracts/constants';

interface EndpointCommand {
    endpointDetails: EndpointDetails;
    url: string | ((...args: string[]) => string);
    TSQ_url?: string;
}

const endpointScopes = new Map<string, string>();
let endpointCount = 0;

for (const [exportName, candidate] of Object.entries(commandExports)) {
    if ((typeof candidate !== 'object' && typeof candidate !== 'function') || !candidate) {
        continue;
    }

    const endpoint = candidate as Partial<EndpointCommand>;
    if (!endpoint.endpointDetails?.SCOPE) continue;

    const endpointUrl =
        typeof endpoint.TSQ_url === 'string'
            ? endpoint.TSQ_url
            : typeof endpoint.url === 'string'
              ? endpoint.url
              : undefined;
    if (!endpointUrl) continue;

    const pathSegments = endpointUrl.split('/').filter(Boolean);
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

function collectControllerFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...collectControllerFiles(fullPath));
        } else if (entry.isFile() && /\.controllers?\.ts$/.test(entry.name)) {
            out.push(fullPath);
        }
    }
    return out;
}

const modulesRoot = path.resolve(__dirname, '../src/modules');
const controllerFiles = collectControllerFiles(modulesRoot);
let apiControllerCount = 0;

for (const file of controllerFiles) {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('ROLE.API')) continue;
    apiControllerCount++;
    const relPath = path.relative(modulesRoot, file);
    assert.ok(
        source.includes('@ApiScopeResource('),
        `Controller ${relPath} grants ROLE.API without @ApiScopeResource`,
    );
    assert.ok(
        source.includes('ScopesGuard'),
        `Controller ${relPath} grants ROLE.API without ScopesGuard`,
    );
}

assert.ok(
    apiControllerCount >= 20,
    `Expected to check all ROLE.API controllers, found ${apiControllerCount}.`,
);

const forwardingSource = fs.readFileSync(
    path.join(modulesRoot, 'nodes/forwarding/node-forwarding.service.ts'),
    'utf8',
);
assert.ok(
    forwardingSource.includes('this.jwtReady = undefined;'),
    'NodeForwardingService.ensureJwt must reset jwtReady on setJwt failure',
);

const nodePluginsSource = fs.readFileSync(
    path.join(modulesRoot, 'node-plugins/node-plugins.service.ts'),
    'utf8',
);
assert.ok(
    nodePluginsSource.includes('await this.ensureJwt();') &&
        nodePluginsSource.includes('this.jwtReady = undefined;'),
    'NodePluginService.preview must initialize node JWT and reset jwtReady on failure',
);

process.stdout.write(
    `API scope catalog uniqueness validation passed (${endpointCount} endpoints, ${apiControllerCount} API controllers)\n`,
);
