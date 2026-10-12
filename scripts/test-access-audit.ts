import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { Global, Module } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';

import { AxiosService } from '@common/axios';
import { PrismaService } from '@common/database/prisma.service';
import { ScopesGuard } from '@common/guards/scopes';
import { RawCacheService } from '@common/raw-cache/raw-cache.service';
import {
    AuditPolicyBodySchema,
    AuditQuerySchema,
    AgentAuditRecordSchema,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import { AccessAuditController } from '../src/modules/access-audit/access-audit.controller';
import { AccessAuditModule } from '../src/modules/access-audit/access-audit.module';
import { AccessAuditService } from '../src/modules/access-audit/access-audit.service';

async function main() {
    assert.deepEqual(AuditPolicyBodySchema.parse({ enabled: false }), {
        enabled: false,
        retentionDays: 7,
    });
    for (const bad of [
        { enabled: true, retentionDays: 0 },
        { enabled: true, retentionDays: 31 },
        { enabled: 'yes' },
        { enabled: true, allUsers: true },
    ])
        assert.equal(AuditPolicyBodySchema.safeParse(bad).success, false);
    for (const bad of [
        { start: '2026-02-30', end: '2026-03-01' },
        { start: '2026-10-02', end: '2026-10-01' },
        { start: '2026-10-01' },
        { start: '2026-01-01', end: '2026-10-01' },
        { limit: 101 },
        { cursor: '9223372036854775808' },
        { start: '2026-10-01', end: '2026-10-31' },
    ])
        assert.equal(AuditQuerySchema.safeParse(bad).success, false);
    const record = {
        connectionId: randomUUID(),
        windowId: randomUUID(),
        userId: '1',
        domain: 'example.com',
        destinationIp: '203.0.113.9',
        destinationPort: 443,
        inbound: 'fixture',
        network: 'tcp',
        protocol: 'tls',
        startedAt: new Date().toISOString(),
        observedAt: new Date().toISOString(),
        closedAt: null,
        upload: '10',
        download: '100',
        partial: false,
        sequence: 1,
    };
    for (const bad of [
        { ...record, domain: 'https://example.com/private' },
        { ...record, upload: '-1' },
        { ...record, upload: '9223372036854775808' },
        { ...record, destinationIp: 'not-an-ip' },
        { ...record, domain: 'example\u0000.com' },
    ])
        assert.equal(AgentAuditRecordSchema.safeParse(bad).success, false);
    @Global()
    @Module({
        providers: [
            { provide: PrismaService, useValue: {} },
            { provide: RawCacheService, useValue: {} },
        ],
        exports: [PrismaService, RawCacheService],
    })
    class Dependencies {}
    @Module({ imports: [Dependencies, AccessAuditModule] })
    class Fixture {}
    const app = await NestFactory.createApplicationContext(Fixture, {
        logger: false,
        abortOnError: false,
    });
    try {
        assert.ok(app.get(AccessAuditService));
    } finally {
        await app.close();
    }
    const guard = new ScopesGuard(new Reflector());
    function allowed(scopes: string[], role: string = ROLE.API) {
        return guard.canActivate({
            getHandler: () => AccessAuditController.prototype.records,
            getClass: () => AccessAuditController,
            switchToHttp: () => ({
                getRequest: () => ({ user: { uuid: randomUUID(), role, scopes } }),
            }),
        } as any);
    }
    assert.equal(allowed(['users:read']), false);
    assert.equal(allowed(['connections:read']), false);
    assert.equal(allowed(['access-audit:read']), true);
    assert.equal(allowed(['access-audit:records-read']), true);
    assert.equal(allowed([], ROLE.ADMIN), true);
    const exportAllowed = (scopes: string[]) =>
        guard.canActivate({
            getHandler: () => AccessAuditController.prototype.export,
            getClass: () => AccessAuditController,
            switchToHttp: () => ({
                getRequest: () => ({ user: { uuid: randomUUID(), role: ROLE.API, scopes } }),
            }),
        } as any);
    assert.equal(exportAllowed(['users:read']), false);
    assert.equal(exportAllowed(['access-audit:records-read']), false);
    assert.equal(exportAllowed(['access-audit:export-read']), true);
    console.log('Audit contract, module/guard startup and independent permissions passed');
    const fixtureURL = process.env.AUDIT_TEST_DATABASE_URL;
    if (!fixtureURL) {
        console.log('Set AUDIT_TEST_DATABASE_URL for the isolated PostgreSQL regressions');
        return;
    }
    const url = new URL(fixtureURL);
    assert.ok(
        ['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/audit_test',
        'Refusing non-fixture database',
    );
    const db = new PrismaClient({ datasourceUrl: url.toString() }) as PrismaService;
    const nodeUuid = randomUUID();
    const createdUsers: bigint[] = [];
    const axios = {
        setJwt: async () => {},
        accessAuditRequest: async () => {
            throw Error('Network requests are not part of this database fixture');
        },
    } as unknown as AxiosService;
    const service = new AccessAuditService(db, axios);
    const second = new AccessAuditService(db, axios);
    try {
        await db.$connect();
        await db.nodes.create({
            data: {
                uuid: nodeUuid,
                name: 'audit-fixture-' + nodeUuid,
                address: nodeUuid + '.invalid',
                isConnected: false,
                trafficUsedBytes: 1234n,
            },
        });
        for (let i = 0; i < 2; i++) {
            const u = await db.users.create({
                data: {
                    shortUuid: randomUUID().slice(0, 12),
                    username: 'audit-fixture-' + randomUUID(),
                    expireAt: new Date(Date.now() + 86400000),
                    trojanPassword: randomUUID(),
                    vlessUuid: randomUUID(),
                    ssPassword: randomUUID(),
                },
            });
            createdUsers.push(u.id);
        }
        const [selected, unselected] = createdUsers;
        assert.equal((await service.policy(Number(selected))).enabled, false);
        assert.equal(await db.userAccessAuditRecord.count(), 0);
        await service.setPolicy(Number(selected), { enabled: true });
        const p = await db.userAccessAuditPolicy.findUniqueOrThrow({ where: { userId: selected } });
        const at = new Date(p.enabledAt!.getTime() + 1);
        const item = {
            ...record,
            windowId: p.windowId!,
            userId: selected.toString(),
            startedAt: at.toISOString(),
            observedAt: at.toISOString(),
        };
        const batch = {
            generation: 'a'.repeat(32),
            hasMore: false,
            records: [item, { ...item, userId: unselected.toString(), connectionId: randomUUID() }],
        };
        await Promise.all([service.ingest(nodeUuid, batch), second.ingest(nodeUuid, batch)]);
        assert.equal(
            await db.userAccessAuditRecord.count(),
            1,
            'Unselected user/replay was stored',
        );
        await service.ingest(nodeUuid, {
            ...batch,
            records: [{ ...item, upload: '20', download: '200' }],
        });
        await service.ingest(nodeUuid, batch);
        const saved = await db.userAccessAuditRecord.findFirstOrThrow();
        assert.equal(saved.uploadBytes, 20n);
        assert.equal(saved.downloadBytes, 200n);
        assert.equal(
            (await db.nodes.findUniqueOrThrow({ where: { uuid: nodeUuid } })).trafficUsedBytes,
            1234n,
            'Audit altered billed node usage',
        );
        const view = await service.records({ userId: Number(selected) });
        assert.equal(view.records.length, 1);
        assert.equal(view.records[0].download, '200');
        const rank = await service.domains({ userId: Number(selected) });
        assert.equal(rank[0].connections, 1);
        assert.equal(rank[0].upload, '20');
        const filter = { userId: Number(selected), nodeUuid, limit: 1, cursor: '1' };
        assert.deepEqual(
            await service.summary(filter),
            {
                connections: '1',
                targets: '1',
                users: '1',
                nodes: '1',
                partial: '0',
                upload: '20',
                download: '200',
            },
            'Range summary must ignore pagination',
        );
        assert.equal(
            (await service.exportRecords(filter)).count,
            1,
            'Export must ignore cursor and page limit',
        );
        const otherConnection = randomUUID();
        await service.ingest(nodeUuid, {
            ...batch,
            records: [{ ...item, connectionId: otherConnection, destinationIp: '203.0.113.10' }],
        });
        const combinedRank = await service.domains({ userId: Number(selected) });
        assert.equal(combinedRank.length, 1, 'Same domain was split by IP');
        assert.equal(combinedRank[0].connections, 2);
        assert.equal(combinedRank[0].upload, '30');
        const firstPage = await service.records({ userId: Number(selected), limit: 1 });
        assert.ok(firstPage.nextCursor);
        const nextPage = await service.records({
            userId: Number(selected),
            limit: 1,
            cursor: firstPage.nextCursor,
        });
        assert.equal(nextPage.records.length, 1);
        assert.notEqual(firstPage.records[0].id, nextPage.records[0].id);
        const expiry = new Date(Date.now() + 60000).toISOString();
        await service.setPolicy(Number(selected), {
            enabled: true,
            retentionDays: 7,
            enabledUntil: expiry,
        });
        await service.setPolicy(Number(selected), { enabled: true, retentionDays: 14 });
        assert.equal(
            (await service.policy(Number(selected))).enabledUntil,
            expiry,
            'Retention edit must preserve audit deadline',
        );
        await assert.rejects(() =>
            service.setPolicy(Number(selected), {
                enabled: true,
                enabledUntil: new Date(Date.now() - 1000).toISOString(),
            }),
        );
        await db.userAccessAuditPolicy.update({
            where: { userId: selected },
            data: { enabledUntil: new Date(Date.now() - 1) },
        });
        const beforeExpiry = await db.userAccessAuditRecord.count();
        await service.ingest(nodeUuid, {
            ...batch,
            records: [{ ...item, connectionId: randomUUID() }],
        });
        assert.equal(
            await db.userAccessAuditRecord.count(),
            beforeExpiry,
            'Expiry must reject ingestion before the scheduler runs',
        );
        assert.equal((await service.policy(Number(selected))).enabled, false);
        await service.expirePolicies();
        assert.equal(
            (await db.userAccessAuditPolicy.findUniqueOrThrow({ where: { userId: selected } }))
                .enabled,
            false,
        );
        await service.setPolicy(Number(selected), { enabled: true, enabledUntil: null });
        const temporaryWindow = await db.userAccessAuditPolicy.findUniqueOrThrow({
            where: { userId: selected },
        });
        assert.notEqual(
            temporaryWindow.windowId,
            p.windowId,
            'Re-enable after expiry must rotate opt-in window',
        );
        assert.equal((await service.policy(Number(selected))).enabledUntil, null);
        const fixtureRows = Array.from({ length: 25 }, (_, i) => ({
            userId: selected,
            nodeUuid,
            windowId: temporaryWindow.windowId!,
            connectionId: randomUUID(),
            domain: `ranking-${i}.example`,
            destinationIp: '203.0.113.9',
            destinationPort: 443,
            inbound: 'fixture',
            network: 'tcp',
            protocol: 'tls',
            startedAt: at,
            observedAt: at,
            expiresAt: new Date(Date.now() + 86400000),
            uploadBytes: i === 24 ? 9007199254740993n : BigInt(25 - i),
            downloadBytes: i === 23 ? 9007199254740993n : BigInt(i),
            partial: i === 24,
        }));
        await db.userAccessAuditRecord.createMany({ data: fixtureRows });
        assert.equal(
            (await service.domains({ userId: Number(selected), direction: 'upload' }))[0].domain,
            'ranking-24.example',
        );
        assert.equal(
            (await service.domains({ userId: Number(selected), direction: 'download' }))[0].domain,
            'ranking-23.example',
        );
        const fullSummary = await service.summary(filter);
        assert.equal(fullSummary.connections, '27');
        assert.equal(fullSummary.targets, '26');
        assert.equal(fullSummary.partial, '1');
        assert.ok(BigInt(fullSummary.upload) > 9007199254740993n);
        assert.equal((await service.summary({ ...filter, domain: 'RANKING-24' })).connections, '1');
        const exported = await service.exportRecords(filter);
        assert.equal(exported.count, 27);
        assert.ok(exported.csv.includes('9007199254740993'));
        await db.userAccessAuditRecord.createMany({
            data: ['literal_100%.example', 'literalx100y.example'].map((domain) => ({
                ...fixtureRows[0],
                connectionId: randomUUID(),
                domain,
            })),
        });
        const literalFilter = { ...filter, domain: 'literal_100%' };
        assert.equal((await service.summary(literalFilter)).connections, '1');
        assert.equal(
            (await service.records({ ...literalFilter, cursor: undefined })).records.length,
            1,
            'Records and summaries must both use literal domain filtering',
        );
        assert.equal(
            (await service.exportRecords(literalFilter)).count,
            1,
            'Export must not expand literal domain filters as SQL wildcards',
        );
        await db.userAccessAuditRecord.createMany({
            data: Array.from({ length: 5001 }, () => ({
                ...fixtureRows[0],
                connectionId: randomUUID(),
                domain: 'export-limit.example',
            })),
        });
        await assert.rejects(
            () => service.exportRecords({ ...filter, domain: 'export-limit' }),
            /5000/,
        );
        assert.equal(
            (await db.nodes.findUniqueOrThrow({ where: { uuid: nodeUuid } })).trafficUsedBytes,
            1234n,
            'Summary/ranking/export must never mutate billing',
        );
        await db.userAccessAuditRecord.deleteMany({
            where: { nodeUuid, domain: { not: 'example.com' } },
        });
        await db.userAccessAuditRecord.deleteMany({ where: { connectionId: otherConnection } });
        await service.setPolicy(Number(selected), { enabled: false });
        await service.ingest(nodeUuid, {
            ...batch,
            records: [{ ...item, connectionId: randomUUID() }],
        });
        assert.equal(await db.userAccessAuditRecord.count(), 1, 'Disabled user was recorded');
        await service.setPolicy(Number(selected), { enabled: true });
        const renewed = await db.userAccessAuditPolicy.findUniqueOrThrow({
            where: { userId: selected },
        });
        assert.notEqual(renewed.windowId, p.windowId);
        await service.ingest(nodeUuid, {
            ...batch,
            records: [{ ...item, connectionId: randomUUID() }],
        });
        assert.equal(await db.userAccessAuditRecord.count(), 1, 'Prior opt-in window was revived');
        await db.userAccessAuditRecord.updateMany({
            data: { expiresAt: new Date(Date.now() - 1) },
        });
        assert.equal(
            (await service.records({ userId: Number(selected) })).records.length,
            0,
            'Expired records remain queryable',
        );
        // A fresh coordinator represents the next scheduled retention sweep;
        // the first coordinator may have just swept during policy synchronization.
        await second.tick();
        assert.equal(await db.userAccessAuditRecord.count(), 0, 'Retention cleanup failed');
        await db.users.delete({ where: { id: selected } });
        assert.equal(
            await db.userAccessAuditPolicy.count({ where: { userId: selected } }),
            0,
            'Deleted user policy not cascaded',
        );
        console.log(
            'Audit PostgreSQL opt-in, concurrent replay, disable/re-enable, queries/ranking, quota isolation, expiry and cascade tests passed',
        );
    } finally {
        service.onApplicationShutdown();
        second.onApplicationShutdown();
        await db.userAccessAuditRecord.deleteMany({ where: { nodeUuid } });
        await db.nodes.deleteMany({ where: { uuid: nodeUuid } });
        await db.users.deleteMany({ where: { id: { in: createdUsers } } });
        await db.$disconnect();
    }
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
