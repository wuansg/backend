import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';

import { AxiosService } from '@common/axios';
import { TypedConfigService } from '@common/config/app-config';
import { PrismaService } from '@common/database/prisma.service';
import { ScopesGuard } from '@common/guards/scopes';
import { RawCacheService } from '@common/raw-cache';
import { stableJsonHash } from '@common/utils/stable-json-hash.util';
import {
    CreateNodeCommand,
    UpdateNodeCommand,
    NodeDeploymentHistorySchema,
    StageConfigProfileCommand,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import { auditCsvCell } from '@modules/access-audit/access-audit-csv.util';
import { ConfigProfileController } from '@modules/config-profiles/config-profile.controller';
import {
    changedSections,
    decryptSnapshot,
    encryptSnapshot,
    restoreTemplateWithCurrentUsers,
    stripDynamicUsers,
} from '@modules/node-deployments/node-deployment-snapshot.util';
import { NodeDeploymentsController } from '@modules/node-deployments/node-deployments.controller';
import { NodeDeploymentsService } from '@modules/node-deployments/node-deployments.service';
import { nodeUpdateNeedsApply } from '@modules/nodes/node-update-policy.util';
import { GetNodeByUuidQuery } from '@modules/nodes/queries/get-node-by-uuid';
import { GetPreparedConfigWithUsersQuery } from '@modules/users/queries/get-prepared-config-with-users';

import { NODES_JOB_NAMES } from '@queue/_nodes/constants';
import { NodeBulkUsersQueueProcessor } from '@queue/_nodes/processors/node-bulk-users.processor';
import { QUEUES_NAMES } from '@queue/queue.enum';

async function main() {
    @Module({
        imports: [CqrsModule],
        controllers: [NodeDeploymentsController],
        providers: [
            NodeDeploymentsService,
            { provide: PrismaService, useValue: {} },
            { provide: AxiosService, useValue: {} },
            { provide: TypedConfigService, useValue: {} },
            { provide: RawCacheService, useValue: {} },
            { provide: getQueueToken(QUEUES_NAMES.NODES.START), useValue: {} },
        ],
    })
    class Fixture {}
    const app = await NestFactory.createApplicationContext(Fixture, {
        logger: false,
        abortOnError: false,
    });
    try {
        assert.ok(app.get(NodeDeploymentsService));
        assert.ok(app.get(NodeDeploymentsController));
    } finally {
        await app.close();
    }
    const id = randomUUID(),
        profileUuid = randomUUID();
    const stageBody = StageConfigProfileCommand.RequestBodySchema.parse({
        uuid: profileUuid,
        config: { inbounds: [{ type: 'anytls', tag: 'test', tls: { min_version: '1.3' } }] },
        deployStrategy: 'immediate',
    });
    assert.equal((stageBody.config as any).inbounds[0].tls.min_version, '1.3');
    assert.equal('deployStrategy' in stageBody, false);
    assert.equal(StageConfigProfileCommand.url, '/api/config-profiles/stage');
    assert.equal(StageConfigProfileCommand.endpointDetails.REQUEST_METHOD, 'post');
    let stagedArguments: unknown[] = [];
    const profileController = new ConfigProfileController({
        updateConfigProfile: async (...args: unknown[]) => {
            stagedArguments = args;
            return { isOk: true, response: { uuid: profileUuid } };
        },
    } as any);
    await profileController.stageConfigProfile(stageBody, { user: { uuid: id } } as any);
    assert.equal(stagedArguments[4], id);
    assert.equal(stagedArguments[5], 'staged');
    const stageGuarded = (scopes: string[]) =>
        new ScopesGuard(new Reflector()).canActivate({
            getHandler: () => ConfigProfileController.prototype.stageConfigProfile,
            getClass: () => ConfigProfileController,
            switchToHttp: () => ({
                getRequest: () => ({ user: { uuid: id, role: ROLE.API, scopes } }),
            }),
        } as any);
    assert.equal(stageGuarded(['config-profiles:read']), false);
    assert.equal(stageGuarded(['config-profiles:stage']), true);
    const node = {
        uuid: id,
        address: 'fixture.invalid',
        port: 2222,
        proxyUrl: null,
        nodeApiSniEnabled: false,
        activePluginUuid: null,
        activeConfigProfileUuid: profileUuid,
        activeInbounds: [{ uuid: 'b' }, { uuid: 'a' }],
    };
    for (const change of [
        { name: 'Renamed' },
        { tags: ['TEST'] },
        { providerUuid: randomUUID() },
        { note: 'note' },
        { trafficLimitBytes: 30 },
        { nodeConsumptionMultiplier: 2 },
        { address: node.address },
        { configProfile: { activeConfigProfileUuid: profileUuid, activeInbounds: ['a', 'b'] } },
    ])
        assert.equal(nodeUpdateNeedsApply(node, change), false);
    for (const change of [
        { address: 'new.invalid' },
        { port: 3333 },
        { proxyUrl: 'socks5://localhost:1080' },
        { nodeApiSniEnabled: true },
        { activePluginUuid: randomUUID() },
        { configProfile: { activeConfigProfileUuid: profileUuid, activeInbounds: ['a'] } },
    ])
        assert.equal(nodeUpdateNeedsApply(node, change), true);
    for (const schema of [CreateNodeCommand.RequestBodySchema, UpdateNodeCommand.RequestBodySchema])
        assert.equal(schema.safeParse({ uuid: id, name: '   ', address: '  ' }).success, false);
    assert.equal(
        UpdateNodeCommand.RequestBodySchema.parse({
            uuid: id,
            name: ' test ',
            address: ' host.invalid ',
        }).name,
        'test',
    );
    const old = {
        inbounds: [
            {
                type: 'trojan',
                tag: 'fixture',
                users: [{ name: 'expired', password: 'old-password' }],
            },
        ],
        dns: { servers: ['old'] },
    };
    const current = {
        inbounds: [
            {
                type: 'trojan',
                tag: 'fixture',
                users: [{ name: 'authorized', password: 'current-password' }],
            },
        ],
        dns: { servers: ['new'] },
    };
    const template = stripDynamicUsers(old);
    assert.equal(JSON.stringify(template).includes('old-password'), false);
    const restored = restoreTemplateWithCurrentUsers(template, current);
    assert.deepEqual(restored.dns, old.dns);
    assert.deepEqual(restored.inbounds, current.inbounds);
    assert.throws(() =>
        restoreTemplateWithCurrentUsers(template, {
            inbounds: [{ type: 'snell', tag: 'fixture', users: [] }],
        }),
    );
    assert.deepEqual(changedSections(template, stripDynamicUsers(current)), ['dns']);
    const encrypted = encryptSnapshot({ template }, 'fixture-secret', id);
    assert.equal(encrypted.includes('old'), false);
    assert.deepEqual(decryptSnapshot(encrypted, 'fixture-secret', id), { template });
    assert.throws(() => decryptSnapshot(encrypted, 'different', id));
    assert.throws(() => decryptSnapshot(encrypted, 'fixture-secret', randomUUID()));
    for (const formula of ['=1+1', ' +SUM(A1:A2)', '\t@cmd', '-5'])
        assert.ok(auditCsvCell(formula).startsWith('"\''));
    assert.equal(auditCsvCell('a,"b'), '"a,""b"');
    const guarded = (method: string, scopes: string[]) =>
        new ScopesGuard(new Reflector()).canActivate({
            getHandler: () => (NodeDeploymentsController.prototype as any)[method],
            getClass: () => NodeDeploymentsController,
            switchToHttp: () => ({
                getRequest: () => ({ user: { uuid: id, role: ROLE.API, scopes } }),
            }),
        } as any);
    assert.equal(guarded('history', ['nodes:read']), false);
    assert.equal(guarded('history', ['node-deployments:history-read']), true);
    assert.equal(guarded('rollback', ['node-deployments:read']), false);
    assert.equal(guarded('rollback', ['node-deployments:rollback']), true);
    const calls: string[] = [];
    const bulk = new NodeBulkUsersQueueProcessor(
        Object.fromEntries(
            [
                'dropUsersConnections',
                'dropIpsConnections',
                'blockIps',
                'unblockIps',
                'recreateTables',
            ].map((k) => [
                k,
                async () => {
                    calls.push(k);
                    return { isOk: true };
                },
            ]),
        ) as any,
        { nodes: { findMany: async () => [{ uuid: id }] } } as any,
        { request: async () => calls.push('reconcile') } as any,
    );
    for (const name of [
        NODES_JOB_NAMES.DROP_USERS_CONNECTIONS,
        NODES_JOB_NAMES.DROP_IPS_CONNECTIONS,
        NODES_JOB_NAMES.BLOCK_IPS,
        NODES_JOB_NAMES.UNBLOCK_IPS,
        NODES_JOB_NAMES.RECREATE_TABLES,
        NODES_JOB_NAMES.ADD_USERS_TO_NODE,
        NODES_JOB_NAMES.REMOVE_USERS_FROM_NODE,
    ])
        await bulk.process({ name, data: { node, data: {} } } as any);
    assert.deepEqual(calls, [
        'dropUsersConnections',
        'dropIpsConnections',
        'blockIps',
        'unblockIps',
        'recreateTables',
        'reconcile',
        'reconcile',
    ]);
    console.log(
        'PASS metadata, trim, fail-closed staging/scopes/opaque config, snapshot encryption/current-user rollback, CSV safety and all legacy security queue branches',
    );
    const fixtureURL = process.env.NODE_DEPLOYMENTS_TEST_DATABASE_URL;
    if (!fixtureURL) {
        console.log('Database tests skipped: set NODE_DEPLOYMENTS_TEST_DATABASE_URL');
        return;
    }
    const url = new URL(fixtureURL);
    assert.ok(
        ['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/audit_test',
        'Refusing non-fixture database',
    );
    const db = new PrismaClient({ datasourceUrl: fixtureURL });
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const actor = randomUUID(),
        tag = 'deployment-' + randomUUID();
    let generation = 1,
        fail = false,
        queueUnavailable = false;
    let users = [{ name: 'old', password: 'old-password' }];
    const sent: any[] = [];
    const config = () => ({
        inbounds: [{ type: 'trojan', tag, users: structuredClone(users) }],
        dns: { marker: generation },
        outbounds: [{ type: 'direct', tag: 'direct' }],
    });
    const payload = () => ({
        coreType: 'SING_BOX' as const,
        singBoxConfig: config(),
        internals: {
            hashes: {
                emptyConfig: stableJsonHash(stripDynamicUsers(config())),
                inbounds: [{ tag, hash: stableJsonHash(users), usersCount: users.length }],
            },
        },
    });
    const queries = {
        execute: async (q: any) => {
            if (q instanceof GetNodeByUuidQuery) {
                const n = await db.nodes.findUniqueOrThrow({ where: { uuid: q.uuid } });
                return { isOk: true, response: { ...n, activeInbounds: [{ uuid: id, tag }] } };
            }
            if (q instanceof GetPreparedConfigWithUsersQuery)
                return {
                    isOk: true,
                    response: {
                        coreType: 'SING_BOX',
                        config: config(),
                        hashesPayload: payload().internals.hashes,
                    },
                };
            throw Error('Unexpected fixture query');
        },
    };
    const axios = {
        startCore: async (p: any) => {
            sent.push(p);
            return {
                isOk: true,
                response: {
                    isStarted: true,
                    error: fail ? 'fixture rejected' : null,
                    configApply: {
                        status: fail ? 'FAILED' : 'APPLIED',
                        requestedHash: 'a'.repeat(64),
                        activeHash: (fail ? 'b' : 'a').repeat(64),
                        rollback: fail ? 'SUCCEEDED' : 'NOT_REQUIRED',
                    },
                },
            };
        },
    };
    const queue = {
        add: async () => {
            if (queueUnavailable) throw Error('fixture queue unavailable');
        },
    };
    const deps = () =>
        new NodeDeploymentsService(
            db as any,
            axios as any,
            { getOrThrow: () => 'fixture-secret' } as any,
            queries as any,
            queue as any,
        );
    const first = deps(),
        recovered = deps();
    const due = async (uuid: string) =>
        db.nodeConfigState.update({ where: { nodeUuid: uuid }, data: { dueAt: new Date(0) } });
    const apply = async (uuid: string) => {
        await due(uuid);
        const claim = await recovered.claim(uuid);
        assert.ok(claim);
        const result = await recovered.apply(claim, profileUuid, payload(), {
            address: 'fixture.invalid',
            port: 2222,
        } as any);
        await recovered.finish(claim, result.success);
        return result;
    };
    try {
        await db.configProfiles.create({
            data: { uuid: profileUuid, name: 'deploy-' + randomUUID(), config: {} },
        });
        const inbound = await db.configProfileInbounds.create({
            data: { profileUuid, tag, type: 'trojan' },
        });
        for (const uuid of ids)
            await db.nodes.create({
                data: {
                    uuid,
                    name: 'deploy-' + uuid,
                    address: uuid + '.invalid',
                    activeConfigProfileUuid: profileUuid,
                    isConnected: true,
                    configProfileInboundsToNodes: {
                        create: { configProfileInboundUuid: inbound.uuid },
                    },
                },
            });
        await Promise.all(
            Array.from({ length: 30 }, () => first.request(ids[0], { reason: 'USER_RECONCILE' })),
        );
        let state = await db.nodeConfigState.findUniqueOrThrow({ where: { nodeUuid: ids[0] } });
        assert.equal(state.requestedSeq, 30n);
        assert.equal(await first.claim(ids[0]), null, 'Quiet window must delay a burst');
        await due(ids[0]);
        const claims = await Promise.all(Array.from({ length: 10 }, () => recovered.claim(ids[0])));
        assert.equal(claims.filter(Boolean).length, 1, 'Only one worker may apply each node');
        const active = claims.find(Boolean)!;
        await first.request(ids[0], { reason: 'USER_RECONCILE' });
        const result = await recovered.apply(active, profileUuid, payload(), {} as any);
        await recovered.finish(active, result.success);
        state = await db.nodeConfigState.findUniqueOrThrow({ where: { nodeUuid: ids[0] } });
        assert.equal(state.processedSeq, 30n);
        assert.equal(state.requestedSeq, 31n, 'In-flight arrival must remain pending');
        await apply(ids[0]);
        assert.equal(sent.length, 2);
        const oldRevision = (await first.history(ids[0])).state!.appliedRevisionUuid!;
        await assert.rejects(() => first.holdProfile(profileUuid), /acknowledged revisions/);
        assert.equal(
            (await first.history(ids[0])).state!.pinnedRevisionUuid,
            null,
            'A rejected staged save must roll back all holds',
        );
        for (const uuid of ids.slice(1)) {
            await first.request(uuid);
            await apply(uuid);
        }
        await first.holdProfile(profileUuid);
        generation = 2;
        await first.request(ids[0], { reason: 'USER_RECONCILE' });
        await apply(ids[0]);
        assert.equal(
            sent.at(-1).singBoxConfig.dns.marker,
            1,
            'Staged profile must not leak through user sync',
        );
        await first.unpin(ids[0], actor);
        await apply(ids[0]);
        assert.equal(sent.at(-1).singBoxConfig.dns.marker, 2);
        users = [{ name: 'new-only', password: 'new-password' }];
        await first.rollback(ids[0], oldRevision, actor);
        await apply(ids[0]);
        assert.equal(sent.at(-1).singBoxConfig.dns.marker, 1);
        assert.deepEqual(sent.at(-1).singBoxConfig.inbounds[0].users, users);
        const stored = await db.nodeConfigRevision.findFirstOrThrow({
            where: { uuid: oldRevision },
        });
        assert.equal(stored.encryptedSnapshot.includes('old-password'), false);
        const history = JSON.parse(JSON.stringify(await first.history(ids[0])));
        NodeDeploymentHistorySchema.parse(history);
        assert.equal(JSON.stringify(history).includes('encryptedSnapshot'), false);
        queueUnavailable = true;
        await first.request(ids[1], { reason: 'USER_RECONCILE' });
        queueUnavailable = false;
        await apply(ids[1]);
        assert.equal(
            (await first.history(ids[1])).state!.requestedSeq,
            (await first.history(ids[1])).state!.processedSeq,
            'Durable work must survive a queue failure/restarted coordinator',
        );
        const batch = await first.createBatch(ids, ids[0], actor);
        await first.tick();
        fail = true;
        const failed = await apply(ids[0]);
        fail = false;
        assert.equal(
            failed.success,
            false,
            'Old core remains started after rollback; that is NOT a successful apply',
        );
        await recovered.tick();
        assert.equal(
            (await db.nodeConfigBatch.findUniqueOrThrow({ where: { uuid: batch.uuid } })).state,
            'FAILED',
        );
        assert.equal(
            await db.nodeConfigDeployment.count({
                where: { batchUuid: batch.uuid, nodeUuid: { in: ids.slice(1) } },
            }),
            0,
            'Failed canary must stop later nodes',
        );
        await first.request(ids[0], { reason: 'USER_RECONCILE' });
        await apply(ids[0]);
        assert.equal(
            sent.at(-1).singBoxConfig.dns.marker,
            1,
            'Failed batch must restore the prior pin for later user sync',
        );
        const successBatch = await first.createBatch(ids, ids[0], actor);
        for (const uuid of ids) {
            await first.tick();
            await apply(uuid);
        }
        await first.tick();
        assert.equal(
            (await db.nodeConfigBatch.findUniqueOrThrow({ where: { uuid: successBatch.uuid } }))
                .state,
            'APPLIED',
        );
        const cancel = await first.createBatch(ids, ids[0], actor);
        await first.tick();
        await first.cancelBatch(cancel.uuid);
        assert.equal(await first.claim(ids[0]), null);
        await recovered.tick();
        assert.equal(
            await db.nodeConfigDeployment.count({ where: { batchUuid: cancel.uuid } }),
            0,
            'Cancelled queued node must not apply',
        );
        await apply(ids[0]);
        await first.request(ids[2], { reason: 'USER_RECONCILE' });
        await due(ids[2]);
        const interrupted = await first.claim(ids[2]);
        assert.ok(interrupted);
        await db.nodeConfigState.update({
            where: { nodeUuid: ids[2] },
            data: { leaseUntil: new Date(0) },
        });
        await apply(ids[2]);
        assert.equal(
            (
                await db.nodeConfigDeployment.findUniqueOrThrow({
                    where: { uuid: interrupted.deploymentUuid },
                })
            ).state,
            'UNKNOWN',
        );
        await first.request(ids[2], { reason: 'USER_RECONCILE' });
        await db.nodes.update({ where: { uuid: ids[2] }, data: { isDisabled: true } });
        await due(ids[2]);
        assert.equal(
            await first.claim(ids[2]),
            null,
            'Disabled nodes must never dispatch configuration',
        );
        await db.nodes.update({ where: { uuid: ids[2] }, data: { isDisabled: false } });
        await apply(ids[2]);
        await first.request(ids[0], { reason: 'MANUAL_RESTART', force: true, actorUuid: actor });
        await first.request(ids[0], { reason: 'USER_RECONCILE' });
        await due(ids[0]);
        const stopOwner = await first.acquireStopLease(ids[0]);
        assert.ok(stopOwner);
        assert.equal(await first.claim(ids[0]), null, 'Start must wait for the stop lease');
        assert.equal(
            await first.acquireStopLease(ids[0]),
            null,
            'Only one stop operation may own a node',
        );
        await first.releaseStopLease(ids[0], stopOwner);
        await apply(ids[0]);
        assert.equal(
            sent.at(-1).internals.forceRestart,
            true,
            'User events must not erase an explicit force restart',
        );
        const manual = (await first.history(ids[0])).deployments[0];
        assert.equal(manual.actorUuid, actor);
        assert.equal(
            manual.reason,
            'MANUAL_RESTART',
            'Queued user events must preserve the operator/source of an explicit request',
        );
        await first.request(ids[0], { reason: 'MANUAL_RESTART', force: true, actorUuid: actor });
        await due(ids[0]);
        const forcing = await first.claim(ids[0]);
        assert.ok(forcing);
        await first.request(ids[0], { reason: 'USER_RECONCILE' });
        const forced = await first.apply(forcing, profileUuid, payload(), {} as any);
        await first.finish(forcing, forced.success);
        await apply(ids[0]);
        assert.equal(
            sent.at(-1).internals.forceRestart,
            false,
            'In-flight user changes must not replay an already consumed forced restart',
        );
        await first.request(ids[0], { reason: 'USER_RECONCILE' });
        await db.nodeConfigState.update({
            where: { nodeUuid: ids[0] },
            data: { requestedAt: new Date(Date.now() - 20000) },
        });
        await first.request(ids[0], { reason: 'USER_RECONCILE' });
        assert.ok(
            (await db.nodeConfigState.findUniqueOrThrow({ where: { nodeUuid: ids[0] } })).dueAt <=
                new Date(),
            'A continuous burst must flush within ten seconds',
        );
        await apply(ids[0]);
        const pinned = (await first.history(ids[0])).state!.pinnedRevisionUuid!;
        const aged = new Date(Date.now() - 91 * 86400000);
        await db.nodeConfigRevision.update({ where: { uuid: pinned }, data: { createdAt: aged } });
        await db.nodeConfigRevision.createMany({
            data: Array.from({ length: 110 }, (_, i) => ({
                uuid: randomUUID(),
                nodeUuid: ids[0],
                profileUuid,
                templateHash: i.toString(16).padStart(64, '0'),
                encryptedSnapshot: 'fixture-unused',
                inboundTags: [tag],
                changedSections: ['dns'],
                createdAt: aged,
            })),
        });
        generation = 3;
        const protectedBatch = await first.createBatch(ids, ids[0], actor);
        const pending = await db.nodeConfigBatch.findUniqueOrThrow({
            where: { uuid: protectedBatch.uuid },
        });
        await db.nodeConfigRevision.updateMany({
            where: { uuid: { in: pending.revisionUuids } },
            data: { createdAt: aged },
        });
        await (first as any).cleanup();
        assert.ok(
            await db.nodeConfigRevision.findUnique({ where: { uuid: pinned } }),
            'Cleanup must preserve the current pin',
        );
        assert.equal(
            await db.nodeConfigRevision.count({ where: { uuid: { in: pending.revisionUuids } } }),
            ids.length,
            'Cleanup must preserve pending batch templates',
        );
        assert.equal(
            await db.nodeConfigRevision.count({ where: { encryptedSnapshot: 'fixture-unused' } }),
            0,
            'Unprotected old revisions must be pruned',
        );
        await first.cancelBatch(protectedBatch.uuid);
        console.log(
            'PASS PostgreSQL coalescing/quiet-window cap, leases/stop serialization, force intent, in-flight convergence, queue/crash recovery, disabled nodes, staged isolation, current-user rollback, safe history/retention and canary failure/success/cancellation',
        );
    } finally {
        first.onApplicationShutdown();
        recovered.onApplicationShutdown();
        await db.nodeConfigBatch.deleteMany({ where: { profileUuid } });
        await db.nodes.deleteMany({ where: { uuid: { in: ids } } });
        await db.configProfiles.deleteMany({ where: { uuid: profileUuid } });
        await db.$disconnect();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
