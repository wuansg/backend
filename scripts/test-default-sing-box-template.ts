import assert from 'node:assert/strict';

import { DEFAULT_TEMPLATE_SINGBOX } from '@modules/subscription-template/constants/default-templates';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value));
    return value as JsonObject;
}

function asObjects(value: unknown): JsonObject[] {
    assert.ok(Array.isArray(value));
    return value.map(asObject);
}

function buildCheckableConfig(): JsonObject {
    const config = structuredClone(DEFAULT_TEMPLATE_SINGBOX) as JsonObject;
    const outbounds = asObjects(config.outbounds);
    const selector = outbounds.find((outbound) => outbound.type === 'selector');

    assert.ok(selector);
    selector.outbounds = ['direct'];

    return config;
}

function validateTemplate(config: JsonObject): void {
    const dns = asObject(config.dns);
    const servers = asObjects(dns.servers);
    const rules = asObjects(dns.rules);
    const cfDoh = servers.find((server) => server.tag === 'cf-doh');
    const cfDns = servers.find((server) => server.tag === 'cf-dns');
    const fakeIp = servers.find((server) => server.tag === 'remote');

    assert.deepEqual(cfDoh, {
        type: 'https',
        tag: 'cf-doh',
        server: '1.1.1.1',
        server_port: 443,
        path: '/dns-query',
        detour: 'direct',
    });
    assert.deepEqual(cfDns, {
        type: 'udp',
        tag: 'cf-dns',
        server: '1.1.1.1',
        server_port: 53,
        detour: 'direct',
    });
    assert.deepEqual(fakeIp, {
        type: 'fakeip',
        tag: 'remote',
        inet4_range: '198.18.0.0/15',
    });
    assert.equal(dns.final, 'cf-doh');
    assert.equal(dns.strategy, 'ipv4_only');
    assert.equal('fakeip' in dns, false);
    assert.equal('independent_cache' in dns, false);
    assert.ok(rules.some((rule) => rule.query_type === 'AAAA' && rule.action === 'reject'));
    assert.ok(
        rules.some(
            (rule) =>
                rule.query_type === 'A' && rule.action === 'route' && rule.server === 'remote',
        ),
    );
    assert.equal(
        rules.some((rule) => 'outbound' in rule),
        false,
    );

    const inbounds = asObjects(config.inbounds);
    const tun = inbounds.find((inbound) => inbound.type === 'tun');

    assert.ok(tun);
    assert.deepEqual(tun.address, ['172.19.0.1/30', 'fdfe:dcba:9876::1/126']);
    assert.equal('inet4_address' in tun, false);
    assert.equal('inet6_address' in tun, false);
    assert.equal(
        inbounds.some((inbound) => 'sniff' in inbound),
        false,
    );

    const route = asObject(config.route);

    assert.deepEqual(route.default_domain_resolver, {
        server: 'cf-dns',
        strategy: 'ipv4_only',
    });
    assert.equal('override_android_vpn' in route, false);

    const cacheFile = asObject(asObject(config.experimental).cache_file);

    assert.equal(cacheFile.store_fakeip, true);
    assert.equal(cacheFile.store_dns, true);
}

function main(): void {
    const config = buildCheckableConfig();

    validateTemplate(config);

    if (process.argv.includes('--print-config')) {
        process.stdout.write(JSON.stringify(config));
        return;
    }

    process.stdout.write('default sing-box 1.14 template validation passed\n');
}

main();
