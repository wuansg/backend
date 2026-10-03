import assert from 'node:assert/strict';

import { PreviewHostSubscriptionCommand } from '@libs/contracts/commands';
import { SUBSCRIPTION_TEMPLATE_TYPE } from '@libs/contracts/constants';
import { HostMapperSchema, ResponseRulesConfigSchema } from '@libs/contracts/models';

import { HostWithRawInbound } from '@modules/hosts/entities/host-with-inbound-tag.entity';
import { normalizeStoredResponseRules } from '@modules/subscription-response-rules/legacy-response-rules';
import { ResponseRulesMatcherService } from '@modules/subscription-response-rules/services/response-rules-matcher.service';
import { TResponseRulesConfig } from '@modules/subscription-response-rules/types/response-rules.types';
import { SubscriptionSettingsEntity } from '@modules/subscription-settings/entities';
import { ResolveProxyConfigService } from '@modules/subscription-template/resolve-proxy/resolve-proxy-config.service';

const legacy = {
    version: '1',
    rules: [
        {
            name: 'Legacy JSON client',
            enabled: true,
            operator: 'AND',
            conditions: [],
            responseType: 'XRAY_JSON',
            responseModifications: {
                ignoreHostXrayJsonTemplate: true,
                ignoreServeJsonAtBaseSubscription: true,
                subscriptionTemplate: 'Custom',
            },
        },
    ],
} as unknown as TResponseRulesConfig;
const migrated = normalizeStoredResponseRules(legacy)!;
assert.equal(migrated.rules[0].responseType, 'XRAY_BASE64');
assert.deepEqual(migrated.rules[0].responseModifications, { subscriptionTemplate: 'Custom' });
assert.equal(
    legacy.rules[0].responseType as string,
    'XRAY_JSON',
    'Must not mutate historical records',
);
assert.equal(ResponseRulesConfigSchema.safeParse(migrated).success, true);
assert.equal(
    ResponseRulesConfigSchema.safeParse(legacy).success,
    false,
    'New JSON rules must be rejected',
);
assert.deepEqual(new SubscriptionSettingsEntity({ responseRules: legacy }).responseRules, migrated);
assert.equal(normalizeStoredResponseRules(null), null);
assert.equal('XRAY_JSON' in SUBSCRIPTION_TEMPLATE_TYPE, false);
assert.equal(
    SUBSCRIPTION_TEMPLATE_TYPE.XRAY_BASE64,
    'XRAY_BASE64',
    'Preserve Base64 wire compatibility',
);
assert.deepEqual(
    HostMapperSchema.parse({ xrayJson: [{ op: 'unset', to: 'mux' }], singbox: [], base64: [] }),
    { singbox: [], base64: [] },
);
const preview = { hostUuid: '00000000-0000-4000-8000-000000000001' };
assert.equal(
    PreviewHostSubscriptionCommand.RequestBodySchema.safeParse({
        ...preview,
        templateType: 'XRAY_JSON',
    }).success,
    false,
);
assert.equal(
    PreviewHostSubscriptionCommand.RequestBodySchema.safeParse({
        ...preview,
        templateType: 'XRAY_BASE64',
    }).success,
    true,
);
const matcher = new ResponseRulesMatcherService();
assert.equal(matcher.matchRules(migrated, {}, undefined).responseType, 'XRAY_BASE64');
for (const oldPath of ['json', 'v2ray-json']) {
    assert.equal(matcher.matchRules(migrated, {}, oldPath as never).responseType, 'BLOCK');
}
assert.equal(matcher.matchRules(migrated, {}, 'singbox').responseType, 'SINGBOX');
async function testSingBoxOnlyResolver(): Promise<void> {
    const resolver = new ResolveProxyConfigService({
        getOrThrow: () => 'sub.example.com',
    } as never);
    const host = (remark: string, rawInbound: object) =>
        new HostWithRawInbound({
            remark,
            rawInbound,
            inboundTag: remark,
            address: 'edge.example.com',
            port: 443,
            excludeFromSubscriptionTypes: [],
            mapper: { xrayJson: [{ op: 'unset', to: 'mux' }], base64: [] },
        } as never);
    const results = await resolver.resolveProxyConfig({
        hosts: [
            host('legacy', { protocol: 'vless', settings: {} }),
            host('anytls', {
                type: 'anytls',
                tls: { enabled: true, server_name: 'edge.example.com' },
            }),
        ],
        user: { status: 'ACTIVE', anytlsPassword: 'test-password' } as never,
        subscriptionSettings: new SubscriptionSettingsEntity({ isShowCustomRemarks: false }),
    });
    assert.equal(results.length, 1, 'Do not render legacy Xray inbounds');
    assert.equal(results[0].protocol, 'anytls');
    assert.equal(results[0].security, 'tls');
    assert.deepEqual(results[0].clientOverrides.mapper, { base64: [] });
    console.log('Xray cleanup compatibility checks passed');
}

void testSingBoxOnlyResolver().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
