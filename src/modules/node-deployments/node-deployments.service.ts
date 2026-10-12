import { NodeConfigState, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    OnApplicationBootstrap,
    OnApplicationShutdown,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { AxiosService } from '@common/axios';
import { INodeConnectionOpts } from '@common/axios/axios.interfaces';
import { TypedConfigService } from '@common/config/app-config';
import { PrismaService } from '@common/database/prisma.service';
import { stableJsonHash } from '@common/utils/stable-json-hash.util';
import { useQueueProcessor } from '@common/utils/startup-app';

import { GetNodeByUuidQuery } from '@modules/nodes/queries/get-node-by-uuid';
import { GetPreparedConfigWithUsersQuery } from '@modules/users/queries/get-prepared-config-with-users';

import { NODES_JOB_NAMES } from '@queue/_nodes/constants';
import { QUEUES_NAMES } from '@queue/queue.enum';

import {
    changedSections,
    decryptSnapshot,
    encryptSnapshot,
    restoreTemplateWithCurrentUsers,
    stripDynamicUsers,
} from './node-deployment-snapshot.util';

type Payload = Parameters<AxiosService['startCore']>[0];
export type NodeClaim = NodeConfigState & { owner: string; deploymentUuid: string };
export type NodeApplyRequest = {
    force?: boolean;
    actorUuid?: string | null;
    reason?: string;
    batchUuid?: string;
    pin?: string | null;
    clearPin?: boolean;
};
const hashValue = (value: unknown) =>
    typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;

@Injectable()
export class NodeDeploymentsService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(NodeDeploymentsService.name);
    private timer?: NodeJS.Timeout;
    private polling = false;
    private lastCleanup = 0;
    constructor(
        private readonly db: PrismaService,
        private readonly axios: AxiosService,
        private readonly config: TypedConfigService,
        private readonly queryBus: QueryBus,
        @InjectQueue(QUEUES_NAMES.NODES.START) private readonly queue: Queue,
    ) {}
    onApplicationBootstrap() {
        if (!useQueueProcessor()) return;
        this.timer = setInterval(
            () =>
                void this.tick().catch(() =>
                    this.logger.warn('Node deployment reconciliation temporarily unavailable'),
                ),
            2000,
        );
        this.timer.unref();
    }
    onApplicationShutdown() {
        if (this.timer) clearInterval(this.timer);
    }
    async request(nodeUuid: string, input: NodeApplyRequest = {}) {
        const now = new Date(),
            reason = input.reason ?? 'CONFIG_APPLY';
        const state = await this.db.$transaction(async (tx) => {
            await this.ensureState(tx, nodeUuid);
            await tx.$queryRaw`SELECT node_uuid FROM node_config_state WHERE node_uuid = ${nodeUuid}::uuid FOR UPDATE`;
            // Read the camel-case Prisma representation after obtaining the row lock.
            const current = await tx.nodeConfigState.findUniqueOrThrow({ where: { nodeUuid } });
            if (input.pin !== undefined && current.leaseUntil && current.leaseUntil > now)
                throw new ConflictException(
                    'Node is applying a configuration; retry after completion',
                );
            const batchPending = Boolean(
                current.batchUuid && current.requestedSeq > current.processedSeq,
            );
            if (
                batchPending &&
                reason !== 'USER_RECONCILE' &&
                input.batchUuid !== current.batchUuid
            )
                throw new ConflictException('Stop the active batch before changing this node');
            if (input.batchUuid && batchPending && current.batchUuid !== input.batchUuid)
                throw new ConflictException('Node belongs to another active deployment batch');
            const requestedAt =
                current.requestedSeq > current.processedSeq ? current.requestedAt : now;
            const running =
                current.leaseUntil && current.leaseUntil > now
                    ? await tx.nodeConfigDeployment.findFirst({
                          where: { nodeUuid, state: 'APPLYING', requestSeq: current.requestedSeq },
                      })
                    : null;
            const retainContext =
                reason === 'USER_RECONCILE' &&
                current.requestedSeq > current.processedSeq &&
                !running;
            const explicitRelease = Boolean(
                input.pin !== undefined ||
                input.clearPin ||
                input.force ||
                ['MANUAL_RESTART', 'NODE_CONFIGURATION_CHANGED', 'NODE_ENABLED'].includes(reason),
            );
            // A busy stream cannot postpone convergence indefinitely; flush within ten seconds.
            const dueAt = new Date(
                reason === 'USER_RECONCILE'
                    ? Math.min(now.getTime() + 1500, requestedAt.getTime() + 10000)
                    : now.getTime(),
            );
            return tx.nodeConfigState.update({
                where: { nodeUuid },
                data: {
                    requestedSeq: { increment: 1 },
                    requestedAt,
                    dueAt,
                    attempts: 0,
                    ...(explicitRelease ? { lastError: null, blocked: false } : {}),
                    reason:
                        (batchPending || retainContext) && reason === 'USER_RECONCILE'
                            ? current.reason
                            : reason,
                    actorUuid:
                        reason === 'USER_RECONCILE' && (batchPending || retainContext)
                            ? current.actorUuid
                            : (input.actorUuid ?? null),
                    force: Boolean(input.force) || (current.force && !running),
                    ...(input.pin !== undefined
                        ? { pinnedRevisionUuid: input.pin }
                        : input.clearPin
                          ? { pinnedRevisionUuid: null }
                          : {}),
                    ...(input.batchUuid
                        ? { batchUuid: input.batchUuid }
                        : !batchPending
                          ? { batchUuid: null }
                          : {}),
                },
            });
        });
        await this.enqueue(nodeUuid).catch(() =>
            this.logger.warn('Node request saved; queue recovery will retry'),
        );
        return { nodeUuid, requestSeq: state.requestedSeq.toString() };
    }
    private async enqueue(nodeUuid: string) {
        return this.queue.add(
            NODES_JOB_NAMES.START_NODE,
            { nodeUuid },
            { jobId: `RECONCILE-${nodeUuid}`, removeOnComplete: true, removeOnFail: true },
        );
    }
    async claim(nodeUuid: string): Promise<NodeClaim | null> {
        return this.db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT node_uuid FROM node_config_state WHERE node_uuid = ${nodeUuid}::uuid FOR UPDATE`;
            const current = await tx.nodeConfigState.findUnique({ where: { nodeUuid } });
            const now = new Date();
            if (
                !current ||
                current.requestedSeq <= current.processedSeq ||
                current.dueAt > now ||
                (current.leaseUntil && current.leaseUntil > now)
            )
                return null;
            const node = await tx.nodes.findUnique({
                where: { uuid: nodeUuid },
                select: { isDisabled: true },
            });
            if (!node || node.isDisabled) return null;
            if (current.batchUuid) {
                const batch = await tx.nodeConfigBatch.findUnique({
                    where: { uuid: current.batchUuid },
                });
                if (!batch || !['PENDING', 'RUNNING'].includes(batch.state)) {
                    await tx.nodeConfigState.update({
                        where: { nodeUuid },
                        data: {
                            batchUuid: null,
                            pinnedRevisionUuid:
                                current.previousPinnedRevisionUuid ?? current.appliedRevisionUuid,
                            previousPinnedRevisionUuid: null,
                            blocked:
                                !current.previousPinnedRevisionUuid && !current.appliedRevisionUuid,
                            reason: 'BATCH_CANCEL_RECONCILE',
                            lastError: 'BATCH_CANCELLED',
                        },
                    });
                    return null;
                }
            }
            const owner = randomUUID();
            await tx.nodeConfigDeployment.updateMany({
                where: { nodeUuid, state: 'APPLYING' },
                data: { state: 'UNKNOWN', errorCode: 'WORKER_INTERRUPTED', finishedAt: now },
            });
            await tx.nodeConfigState.update({
                where: { nodeUuid },
                data: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 180000) },
            });
            const deployment = await tx.nodeConfigDeployment.create({
                data: {
                    nodeUuid,
                    requestSeq: current.requestedSeq,
                    actorUuid: current.actorUuid,
                    reason: current.reason,
                    batchUuid: current.batchUuid,
                },
            });
            return { ...current, owner, deploymentUuid: deployment.uuid };
        });
    }
    heartbeat(claim: NodeClaim) {
        return this.db.nodeConfigState.updateMany({
            where: { nodeUuid: claim.nodeUuid, leaseOwner: claim.owner },
            data: { leaseUntil: new Date(Date.now() + 180000) },
        });
    }
    async acquireStopLease(nodeUuid: string): Promise<string | null> {
        return this.db.$transaction(async (tx) => {
            await this.ensureState(tx, nodeUuid);
            await tx.$queryRaw`SELECT node_uuid FROM node_config_state WHERE node_uuid = ${nodeUuid}::uuid FOR UPDATE`;
            const current = await tx.nodeConfigState.findUniqueOrThrow({ where: { nodeUuid } });
            if (current.leaseUntil && current.leaseUntil > new Date()) return null;
            const owner = randomUUID();
            await tx.nodeConfigState.update({
                where: { nodeUuid },
                data: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 180000) },
            });
            return owner;
        });
    }
    async releaseStopLease(nodeUuid: string, owner: string) {
        await this.db.nodeConfigState.updateMany({
            where: { nodeUuid, leaseOwner: owner },
            data: { leaseOwner: null, leaseUntil: null },
        });
    }
    private async ensureState(tx: Prisma.TransactionClient, nodeUuid: string) {
        // Prisma's empty-update upsert may emulate read/create and race on first insertion.
        await tx.$executeRaw`INSERT INTO node_config_state (node_uuid) VALUES (${nodeUuid}::uuid) ON CONFLICT (node_uuid) DO NOTHING`;
    }
    private binding(nodeUuid: string, templateHash: string) {
        return nodeUuid + ':' + templateHash;
    }
    private secret() {
        return this.config.getOrThrow('APP_SECRET');
    }
    private decode(revision: {
        encryptedSnapshot: string;
        nodeUuid: string;
        templateHash: string;
    }) {
        return decryptSnapshot(
            revision.encryptedSnapshot,
            this.secret(),
            this.binding(revision.nodeUuid, revision.templateHash),
        );
    }
    async saveRevision(nodeUuid: string, profileUuid: string, payload: Payload) {
        const template = stripDynamicUsers(payload.singBoxConfig);
        const snapshot = { template, emptyConfigHash: payload.internals.hashes.emptyConfig };
        const templateHash = stableJsonHash(snapshot);
        const known = await this.db.nodeConfigRevision.findUnique({
            where: { nodeUuid_profileUuid_templateHash: { nodeUuid, profileUuid, templateHash } },
        });
        if (known) return known;
        const state = await this.db.nodeConfigState.findUnique({ where: { nodeUuid } });
        const previous = state?.appliedRevisionUuid
            ? await this.db.nodeConfigRevision.findUnique({
                  where: { uuid: state.appliedRevisionUuid },
              })
            : null;
        let oldTemplate: Record<string, unknown> | undefined;
        if (previous) {
            try {
                oldTemplate = this.decode(previous).template as Record<string, unknown>;
            } catch {
                /* Key rotation makes old snapshots unavailable, never plaintext. */
            }
        }
        const inboundTags = (Array.isArray(template.inbounds) ? template.inbounds : [])
            .flatMap((value) =>
                typeof (value as { tag?: unknown }).tag === 'string'
                    ? [(value as { tag: string }).tag]
                    : [],
            )
            .sort();
        return this.db.nodeConfigRevision.upsert({
            where: { nodeUuid_profileUuid_templateHash: { nodeUuid, profileUuid, templateHash } },
            update: {},
            create: {
                nodeUuid,
                profileUuid,
                templateHash,
                inboundTags,
                changedSections: changedSections(oldTemplate, template),
                encryptedSnapshot: encryptSnapshot(
                    snapshot,
                    this.secret(),
                    this.binding(nodeUuid, templateHash),
                ),
            },
        });
    }
    async apply(
        claim: NodeClaim,
        profileUuid: string,
        payload: Payload,
        opts: INodeConnectionOpts,
    ) {
        if (claim.blocked) throw Error('EXPLICIT_RELEASE_REQUIRED');
        let revision;
        if (claim.pinnedRevisionUuid) {
            revision = await this.db.nodeConfigRevision.findFirst({
                where: { uuid: claim.pinnedRevisionUuid, nodeUuid: claim.nodeUuid, profileUuid },
            });
            if (!revision) throw Error('PINNED_REVISION_UNAVAILABLE');
            const tags = (
                Array.isArray(payload.singBoxConfig.inbounds) ? payload.singBoxConfig.inbounds : []
            )
                .map((value) => (value as { tag: string }).tag)
                .sort();
            if (JSON.stringify(tags) !== JSON.stringify(revision.inboundTags))
                throw Error('ROLLBACK_INBOUND_MISMATCH');
            const snapshot = this.decode(revision);
            payload = {
                ...payload,
                singBoxConfig: restoreTemplateWithCurrentUsers(
                    snapshot.template as Record<string, unknown>,
                    payload.singBoxConfig,
                ),
                internals: {
                    ...payload.internals,
                    hashes: {
                        ...payload.internals.hashes,
                        emptyConfig: snapshot.emptyConfigHash as string,
                    },
                },
            };
        } else revision = await this.saveRevision(claim.nodeUuid, profileUuid, payload);
        const currentNode = await this.db.nodes.findUnique({
            where: { uuid: claim.nodeUuid },
            select: { isDisabled: true, activeConfigProfileUuid: true },
        });
        if (
            !currentNode ||
            currentNode.isDisabled ||
            currentNode.activeConfigProfileUuid !== profileUuid
        )
            throw Error('NODE_ASSIGNMENT_CHANGED');
        await this.db.nodeConfigDeployment.update({
            where: { uuid: claim.deploymentUuid },
            data: { revisionUuid: revision.uuid },
        });
        const result = await this.axios.startCore(
            { ...payload, internals: { ...payload.internals, forceRestart: claim.force } },
            opts,
        );
        const ack = result.isOk ? result.response.configApply : null;
        const success = Boolean(
            result.isOk &&
            result.response.isStarted &&
            !result.response.error &&
            ack &&
            ['APPLIED', 'UNCHANGED'].includes(ack.status) &&
            ack.requestedHash &&
            ack.activeHash === ack.requestedHash,
        );
        await this.db.nodeConfigDeployment.update({
            where: { uuid: claim.deploymentUuid },
            data: {
                state: success
                    ? 'APPLIED'
                    : ack?.rollback === 'SUCCEEDED'
                      ? 'ROLLED_BACK'
                      : 'FAILED',
                errorCode: success
                    ? null
                    : result.isOk
                      ? 'AGENT_REJECTED_CONFIGURATION'
                      : 'AGENT_REQUEST_FAILED',
                requestedHash: hashValue(ack?.requestedHash),
                activeHash: hashValue(ack?.activeHash),
                rollback: ack?.rollback ?? null,
            },
        });
        if (success)
            await this.db.nodeConfigState.updateMany({
                where: { nodeUuid: claim.nodeUuid, leaseOwner: claim.owner },
                data: { appliedRevisionUuid: revision.uuid },
            });
        return { result, success };
    }
    async finish(
        claim: NodeClaim,
        success: boolean,
        errorCode = 'CONFIG_APPLICATION_FAILED',
        coreless = false,
    ) {
        await this.db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT node_uuid FROM node_config_state WHERE node_uuid = ${claim.nodeUuid}::uuid FOR UPDATE`;
            const current = await tx.nodeConfigState.findUniqueOrThrow({
                where: { nodeUuid: claim.nodeUuid },
            });
            if (current.leaseOwner !== claim.owner) return;
            const now = new Date();
            await tx.nodeConfigDeployment.updateMany({
                where: { uuid: claim.deploymentUuid, state: 'APPLYING' },
                data: {
                    state: success ? (coreless ? 'NO_CORE' : 'APPLIED') : 'FAILED',
                    errorCode: success ? null : errorCode,
                },
            });
            if (!success)
                await tx.nodeConfigDeployment.updateMany({
                    where: { uuid: claim.deploymentUuid, state: 'APPLIED' },
                    data: { state: 'FAILED', errorCode },
                });
            const deployment = await tx.nodeConfigDeployment.findUniqueOrThrow({
                where: { uuid: claim.deploymentUuid },
            });
            await tx.nodeConfigDeployment.update({
                where: { uuid: claim.deploymentUuid },
                data: {
                    finishedAt: now,
                    durationMs: Math.max(
                        0,
                        Math.min(2147483647, now.getTime() - deployment.startedAt.getTime()),
                    ),
                },
            });
            const attempts = success ? 0 : current.attempts + 1;
            const terminal = success || attempts >= 3 || Boolean(claim.batchUuid);
            await tx.nodeConfigState.update({
                where: { nodeUuid: claim.nodeUuid },
                data: {
                    leaseOwner: null,
                    leaseUntil: null,
                    attempts,
                    lastError: success ? null : errorCode,
                    ...(claim.batchUuid
                        ? {
                              previousPinnedRevisionUuid: null,
                              ...(!success
                                  ? {
                                        pinnedRevisionUuid:
                                            claim.previousPinnedRevisionUuid ??
                                            current.appliedRevisionUuid,
                                        blocked:
                                            !claim.previousPinnedRevisionUuid &&
                                            !current.appliedRevisionUuid,
                                    }
                                  : {}),
                          }
                        : {}),
                    ...(terminal
                        ? {
                              processedSeq:
                                  claim.requestedSeq > current.processedSeq
                                      ? claim.requestedSeq
                                      : current.processedSeq,
                          }
                        : {}),
                    ...(current.requestedSeq === claim.requestedSeq
                        ? {
                              force: false,
                              dueAt: new Date(Date.now() + Math.min(60000, attempts * 10000)),
                              ...(terminal ? { batchUuid: null } : {}),
                          }
                        : {}),
                },
            });
        });
    }
    async history(nodeUuid: string) {
        const node = await this.db.nodes.findUnique({ where: { uuid: nodeUuid } });
        if (!node) throw new NotFoundException('Node not found');
        const [state, revisions, deployments, batches, eligibleNodes] = await Promise.all([
            this.db.nodeConfigState.findUnique({ where: { nodeUuid } }),
            this.db.nodeConfigRevision.findMany({
                where: { nodeUuid },
                orderBy: { createdAt: 'desc' },
                take: 100,
                select: {
                    uuid: true,
                    profileUuid: true,
                    templateHash: true,
                    inboundTags: true,
                    changedSections: true,
                    createdAt: true,
                },
            }),
            this.db.nodeConfigDeployment.findMany({
                where: { nodeUuid },
                orderBy: { startedAt: 'desc' },
                take: 100,
            }),
            this.db.nodeConfigBatch.findMany({
                where: { nodeUuids: { has: nodeUuid } },
                orderBy: { createdAt: 'desc' },
                take: 20,
                select: {
                    uuid: true,
                    state: true,
                    nodeUuids: true,
                    nextIndex: true,
                    activeNodeUuid: true,
                    errorCode: true,
                    createdAt: true,
                    finishedAt: true,
                },
            }),
            this.db.nodes.findMany({
                where: {
                    isDisabled: false,
                    activeConfigProfileUuid: node.activeConfigProfileUuid,
                    configProfileInboundsToNodes: { some: {} },
                },
                select: { uuid: true, name: true, isConnected: true },
            }),
        ]);
        return {
            nodeUuid,
            state: state
                ? {
                      requestedSeq: state.requestedSeq.toString(),
                      processedSeq: state.processedSeq.toString(),
                      pinnedRevisionUuid: state.pinnedRevisionUuid,
                      appliedRevisionUuid: state.appliedRevisionUuid,
                      blocked: state.blocked,
                      reason: state.reason,
                      attempts: state.attempts,
                      lastError: state.lastError,
                      applying: Boolean(state.leaseUntil && state.leaseUntil > new Date()),
                  }
                : null,
            revisions,
            deployments: deployments.map((d) => ({ ...d, requestSeq: d.requestSeq.toString() })),
            batches,
            eligibleNodes,
        };
    }
    async rollback(nodeUuid: string, revisionUuid: string, actorUuid: string | null) {
        const revision = await this.db.nodeConfigRevision.findFirst({
            where: { uuid: revisionUuid, nodeUuid, deployments: { some: { state: 'APPLIED' } } },
        });
        if (!revision)
            throw new BadRequestException(
                'Only a successfully applied revision from this node can be restored',
            );
        // Authenticate/decode before changing the desired version.
        let snapshot: Record<string, unknown>;
        try {
            snapshot = this.decode(revision);
        } catch {
            throw new BadRequestException(
                'Revision cannot be decrypted with the current application secret',
            );
        }
        const node = await this.queryBus.execute(new GetNodeByUuidQuery(nodeUuid));
        if (
            !node.isOk ||
            node.response.isDisabled ||
            node.response.activeConfigProfileUuid !== revision.profileUuid
        )
            throw new BadRequestException('Revision belongs to a different active profile');
        const prepared = await this.queryBus.execute(
            new GetPreparedConfigWithUsersQuery(revision.profileUuid, node.response.activeInbounds),
        );
        if (!prepared.isOk) throw new BadRequestException('Cannot verify current authorized users');
        const current = prepared.response.config as Record<string, unknown>;
        const tags = (Array.isArray(current.inbounds) ? current.inbounds : [])
            .map((value) => (value as { tag: string }).tag)
            .sort();
        if (JSON.stringify(tags) !== JSON.stringify(revision.inboundTags))
            throw new BadRequestException(
                'Active inbound assignments changed; restore compatible configuration first',
            );
        restoreTemplateWithCurrentUsers(snapshot.template as Record<string, unknown>, current);
        return this.request(nodeUuid, {
            pin: revisionUuid,
            actorUuid,
            reason: 'ROLLBACK',
            force: false,
        });
    }
    async unpin(nodeUuid: string, actorUuid: string | null) {
        const node = await this.db.nodes.findUnique({ where: { uuid: nodeUuid } });
        if (!node || node.isDisabled) throw new BadRequestException('Choose an enabled node');
        return this.request(nodeUuid, { pin: null, actorUuid, reason: 'RESUME_CURRENT_PROFILE' });
    }
    async assertEditable(nodeUuid: string) {
        const batch = await this.db.nodeConfigBatch.findFirst({
            where: { nodeUuids: { has: nodeUuid }, state: { in: ['PENDING', 'RUNNING'] } },
        });
        if (batch)
            throw new ConflictException(
                'Stop the active deployment batch before changing node configuration',
            );
    }
    async assertProfileEditable(profileUuid: string) {
        const batch = await this.db.nodeConfigBatch.findFirst({
            where: { profileUuid, state: { in: ['PENDING', 'RUNNING'] } },
        });
        if (batch)
            throw new ConflictException(
                'Stop the active deployment batch before changing its profile',
            );
    }
    async holdProfile(profileUuid: string) {
        await this.assertProfileEditable(profileUuid);
        const nodes = await this.db.nodes.findMany({
            where: {
                activeConfigProfileUuid: profileUuid,
                isDisabled: false,
                configProfileInboundsToNodes: { some: {} },
            },
            orderBy: { uuid: 'asc' },
        });
        // Refuse to guess what a legacy node is actually running: establish an acknowledged
        // revision through an ordinary refresh before offering a staged release.
        await this.db.$transaction(
            async (tx) => {
                for (const node of nodes) {
                    await this.ensureState(tx, node.uuid);
                    await tx.$queryRaw`SELECT node_uuid FROM node_config_state WHERE node_uuid = ${node.uuid}::uuid FOR UPDATE`;
                    const state = await tx.nodeConfigState.findUniqueOrThrow({
                        where: { nodeUuid: node.uuid },
                    });
                    if ((state.leaseUntil && state.leaseUntil > new Date()) || state.batchUuid)
                        throw new ConflictException(
                            'Wait for active node applications to finish before staging',
                        );
                    const revisionUuid = state.pinnedRevisionUuid ?? state.appliedRevisionUuid;
                    const revision = revisionUuid
                        ? await tx.nodeConfigRevision.findFirst({
                              where: {
                                  uuid: revisionUuid,
                                  nodeUuid: node.uuid,
                                  profileUuid,
                                  deployments: { some: { state: 'APPLIED' } },
                              },
                          })
                        : null;
                    if (!revision)
                        throw new BadRequestException(
                            'Refresh all core nodes to establish acknowledged revisions before staging this profile',
                        );
                    try {
                        this.decode(revision);
                    } catch {
                        throw new BadRequestException(
                            'Current revision cannot be decrypted; restore the matching APP_SECRET before staging',
                        );
                    }
                    await tx.nodeConfigState.update({
                        where: { nodeUuid: node.uuid },
                        data: { pinnedRevisionUuid: revision.uuid },
                    });
                }
            },
            { timeout: 30000 },
        );
    }
    async createBatch(nodeUuids: string[], canaryUuid: string, actorUuid: string | null) {
        if (
            !nodeUuids.length ||
            nodeUuids.length > 100 ||
            new Set(nodeUuids).size !== nodeUuids.length ||
            !nodeUuids.includes(canaryUuid)
        )
            throw new BadRequestException('Choose unique nodes and a canary from the same list');
        const ordered = [canaryUuid, ...nodeUuids.filter((id) => id !== canaryUuid)];
        const revisions = [];
        let profileUuid: string | null = null;
        let sourceConfigHash: string | null = null;
        for (const uuid of ordered) {
            const found = await this.queryBus.execute(new GetNodeByUuidQuery(uuid));
            if (
                !found.isOk ||
                found.response.isDisabled ||
                !found.response.isConnected ||
                !found.response.activeConfigProfileUuid ||
                !found.response.activeInbounds.length
            )
                throw new BadRequestException('Batch nodes must be online core nodes');
            const n = found.response;
            if (profileUuid && n.activeConfigProfileUuid !== profileUuid)
                throw new BadRequestException('Batch nodes must share a profile');
            profileUuid = n.activeConfigProfileUuid;
            const prepared = await this.queryBus.execute(
                new GetPreparedConfigWithUsersQuery(profileUuid!, n.activeInbounds),
            );
            if (!prepared.isOk)
                throw new BadRequestException('Failed to prepare batch configuration');
            const configHash = prepared.response.hashesPayload.emptyConfig;
            if (sourceConfigHash && configHash !== sourceConfigHash)
                throw new ConflictException('Profile changed while preparing the batch; retry');
            sourceConfigHash = configHash;
            revisions.push(
                await this.saveRevision(uuid, profileUuid!, {
                    coreType: 'SING_BOX',
                    singBoxConfig: prepared.response.config as Record<string, unknown>,
                    internals: { hashes: prepared.response.hashesPayload },
                }),
            );
        }
        const batch = await this.db.nodeConfigBatch.create({
            data: {
                profileUuid: profileUuid!,
                sourceHash: stableJsonHash(revisions.map((r) => r.templateHash)),
                nodeUuids: ordered,
                revisionUuids: revisions.map((r) => r.uuid),
                actorUuid,
            },
        });
        return { uuid: batch.uuid, state: batch.state, canaryUuid, nodes: ordered.length };
    }
    async cancelBatch(uuid: string) {
        const result = await this.db.nodeConfigBatch.updateMany({
            where: { uuid, state: { in: ['PENDING', 'RUNNING'] } },
            data: { state: 'CANCELLED', finishedAt: new Date() },
        });
        if (!result.count)
            throw new ConflictException('Batch is already finished or does not exist');
        return { uuid, state: 'CANCELLED' };
    }
    private async batches() {
        const rows = await this.db.nodeConfigBatch.findMany({
            where: { state: { in: ['PENDING', 'RUNNING'] } },
            orderBy: { createdAt: 'asc' },
            take: 10,
        });
        for (const candidate of rows) {
            const owner = randomUUID();
            const acquired = await this.db.nodeConfigBatch.updateMany({
                where: {
                    uuid: candidate.uuid,
                    state: { in: ['PENDING', 'RUNNING'] },
                    OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
                },
                data: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 30000) },
            });
            if (!acquired.count) continue;
            const batch = await this.db.nodeConfigBatch.findUniqueOrThrow({
                where: { uuid: candidate.uuid },
            });
            try {
                if (batch.activeNodeUuid) {
                    const result = await this.db.nodeConfigDeployment.findFirst({
                        where: {
                            batchUuid: batch.uuid,
                            nodeUuid: batch.activeNodeUuid,
                            requestSeq: { gte: batch.activeRequestSeq ?? 0n },
                            finishedAt: { not: null },
                        },
                        orderBy: { startedAt: 'desc' },
                    });
                    if (!result) continue;
                    if (result.state !== 'APPLIED') {
                        await this.db.nodeConfigBatch.updateMany({
                            where: { uuid: batch.uuid, state: 'RUNNING' },
                            data: {
                                state: 'FAILED',
                                errorCode: result.errorCode ?? 'NODE_NOT_CONFIRMED',
                                finishedAt: new Date(),
                            },
                        });
                        continue;
                    }
                }
                if (batch.nextIndex >= batch.nodeUuids.length) {
                    await this.db.nodeConfigBatch.updateMany({
                        where: { uuid: batch.uuid, state: { in: ['PENDING', 'RUNNING'] } },
                        data: { state: 'APPLIED', finishedAt: new Date(), activeNodeUuid: null },
                    });
                    continue;
                }
                const nodeUuid = batch.nodeUuids[batch.nextIndex];
                // Serialize cancellation and dispatch; never dispatch a subsequent node after cancellation.
                await this.db.$transaction(async (tx) => {
                    await tx.$queryRaw`SELECT uuid FROM node_config_batches WHERE uuid = ${batch.uuid}::uuid FOR UPDATE`;
                    const fresh = await tx.nodeConfigBatch.findUniqueOrThrow({
                        where: { uuid: batch.uuid },
                    });
                    if (!['PENDING', 'RUNNING'].includes(fresh.state)) return;
                    await this.ensureState(tx, nodeUuid);
                    await tx.$queryRaw`SELECT node_uuid FROM node_config_state WHERE node_uuid = ${nodeUuid}::uuid FOR UPDATE`;
                    const state = await tx.nodeConfigState.findUnique({ where: { nodeUuid } });
                    if (state?.leaseUntil && state.leaseUntil > new Date()) return;
                    if (
                        state?.batchUuid &&
                        state.batchUuid !== batch.uuid &&
                        state.requestedSeq > state.processedSeq
                    )
                        throw Error('BATCH_NODE_BUSY');
                    const next = await tx.nodeConfigState.update({
                        where: { nodeUuid },
                        data: {
                            requestedSeq: { increment: 1 },
                            requestedAt: new Date(),
                            dueAt: new Date(),
                            reason: 'BATCH_APPLY',
                            actorUuid: batch.actorUuid,
                            batchUuid: batch.uuid,
                            previousPinnedRevisionUuid:
                                state?.pinnedRevisionUuid ?? state?.appliedRevisionUuid,
                            pinnedRevisionUuid: batch.revisionUuids[batch.nextIndex],
                            attempts: 0,
                            lastError: null,
                            blocked: false,
                        },
                    });
                    await tx.nodeConfigBatch.update({
                        where: { uuid: batch.uuid },
                        data: {
                            state: 'RUNNING',
                            activeNodeUuid: nodeUuid,
                            activeRequestSeq: next.requestedSeq,
                            nextIndex: { increment: 1 },
                        },
                    });
                });
            } catch {
                await this.db.nodeConfigBatch.updateMany({
                    where: { uuid: batch.uuid, state: { in: ['PENDING', 'RUNNING'] } },
                    data: {
                        state: 'FAILED',
                        errorCode: 'BATCH_DISPATCH_FAILED',
                        finishedAt: new Date(),
                    },
                });
            } finally {
                await this.db.nodeConfigBatch.updateMany({
                    where: { uuid: batch.uuid, leaseOwner: owner },
                    data: { leaseOwner: null, leaseUntil: null },
                });
            }
        }
    }
    async tick() {
        if (this.polling) return;
        this.polling = true;
        try {
            await this.batches();
            const pending = await this.db.$queryRaw<
                Array<{ node_uuid: string }>
            >`SELECT s.node_uuid FROM node_config_state s JOIN nodes n ON n.uuid=s.node_uuid WHERE s.requested_seq>s.processed_seq AND s.due_at<=now() AND (s.lease_until IS NULL OR s.lease_until<now()) AND NOT n.is_disabled ORDER BY s.due_at LIMIT 100`;
            await Promise.all(pending.map((row) => this.enqueue(row.node_uuid)));
            if (Date.now() - this.lastCleanup > 3600000) {
                await this.cleanup();
                this.lastCleanup = Date.now();
            }
        } finally {
            this.polling = false;
        }
    }
    private async cleanup() {
        await this.db
            .$executeRaw`DELETE FROM node_config_deployments d WHERE d.state<>'APPLYING' AND d.uuid IN (SELECT uuid FROM (SELECT uuid,started_at,row_number() OVER (PARTITION BY node_uuid ORDER BY started_at DESC) AS position FROM node_config_deployments WHERE state<>'APPLYING') ranked WHERE position>200 OR started_at<now()-interval '90 days')`;
        await this.db
            .$executeRaw`DELETE FROM node_config_revisions r WHERE r.created_at<now()-interval '1 hour' AND r.uuid IN (SELECT uuid FROM (SELECT uuid,node_uuid,created_at,row_number() OVER (PARTITION BY node_uuid ORDER BY created_at DESC) AS position FROM node_config_revisions) ranked WHERE position>100 OR created_at<now()-interval '90 days') AND NOT EXISTS (SELECT 1 FROM node_config_state s WHERE s.applied_revision_uuid=r.uuid OR s.pinned_revision_uuid=r.uuid OR s.previous_pinned_revision_uuid=r.uuid) AND NOT EXISTS (SELECT 1 FROM node_config_deployments d WHERE d.revision_uuid=r.uuid AND d.state='APPLYING') AND NOT EXISTS (SELECT 1 FROM node_config_batches b WHERE b.state IN ('PENDING','RUNNING') AND r.uuid=ANY(b.revision_uuids))`;
        await this.db.nodeConfigBatch.deleteMany({
            where: {
                state: { notIn: ['PENDING', 'RUNNING'] },
                createdAt: { lt: new Date(Date.now() - 90 * 86400000) },
            },
        });
    }
}
