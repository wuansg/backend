import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    OPAQUE_JSON_FIELDS,
    OpaqueJsonCamelCasePlugin,
} from '@common/database/opaque-json-camel-case.plugin';

class TestPlugin extends OpaqueJsonCamelCasePlugin {
    public map(row: Record<string, unknown>): Record<string, unknown> {
        return this.mapRow(row);
    }
}

function getPrismaJsonFields(): Set<string> {
    const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    return new Set(
        Array.from(schema.matchAll(/^\s+(\w+)\s+Json\??(?:\s|$)/gm), (match) => match[1]),
    );
}

function main(): void {
    assert.deepEqual(
        [...OPAQUE_JSON_FIELDS].sort(),
        [...getPrismaJsonFields()].sort(),
        'OPAQUE_JSON_FIELDS must contain every Prisma Json/Json? field',
    );

    const minVersionConfig = {
        dns: {
            servers: [
                {
                    tls: {
                        min_version: '1.2',
                        'X-Custom_Header': 'preserve-me',
                    },
                },
            ],
        },
    };

    const plugin = new TestPlugin();
    const mapped = plugin.map({
        profile_uuid: 'profile-id',
        config: minVersionConfig,
        inbounds: [
            {
                profile_uuid: 'profile-id',
                raw_inbound: {
                    listen_port: 443,
                    tls: { min_version: '1.2' },
                },
            },
        ],
    });

    assert.equal(mapped.profileUuid, 'profile-id');
    assert.strictEqual(mapped.config, minVersionConfig);
    assert.deepEqual(mapped.inbounds, [
        {
            profileUuid: 'profile-id',
            rawInbound: {
                listen_port: 443,
                tls: { min_version: '1.2' },
            },
        },
    ]);
}

main();
