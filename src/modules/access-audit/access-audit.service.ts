import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    OnApplicationBootstrap,
    OnApplicationShutdown,
} from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { PrismaService } from '@common/database/prisma.service';
import {
    AgentAuditBatchSchema,
    AgentAuditStatusSchema,
    AuditPolicyBodySchema,
    AuditQuerySchema,
} from '@libs/contracts/commands';

@Injectable()
export class AccessAuditService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(AccessAuditService.name);
    private timer?: NodeJS.Timeout;
    private polling = false;
    private jwtReady?: Promise<void>;
    private lastCleanup = 0;
    constructor(
        private readonly db: PrismaService,
        private readonly axios: AxiosService,
    ) {}
    onApplicationBootstrap() {
        this.timer = setInterval(
            () =>
                void this.tick().catch(() =>
                    this.logger.warn('Access audit coordination temporarily unavailable'),
                ),
            10000,
        );
        this.timer.unref();
    }
    onApplicationShutdown() {
        if (this.timer) clearInterval(this.timer);
    }
    private async ensureJwtReady() {
        this.jwtReady ??= this.axios.setJwt().catch((e) => {
            this.jwtReady = undefined;
            throw e;
        });
        await this.jwtReady;
    }
    async policy(userId: number) {
        if (
            !(await this.db.users.findUnique({
                where: { id: BigInt(userId) },
                select: { id: true },
            }))
        )
            throw new NotFoundException('User not found');
        const p = await this.db.userAccessAuditPolicy.findUnique({
            where: { userId: BigInt(userId) },
        });
        const nodes = await this.db.nodes.findMany({
            include: { runtimeInventory: true, accessAuditState: true },
            orderBy: { viewPosition: 'asc' },
        });
        return {
            enabled: p?.enabled ?? false,
            retentionDays: p?.retentionDays ?? 7,
            enabledAt: p?.enabledAt?.toISOString() ?? null,
            nodes: nodes.map((n) => ({
                uuid: n.uuid,
                name: n.name,
                connected: n.isConnected,
                mode: n.runtimeInventory?.runtimeMode ?? 'UNKNOWN',
                supported: Boolean(
                    n.runtimeInventory?.capabilities.includes('user_access_audit_v1'),
                ),
                syncedAt: n.accessAuditState?.syncedAt?.toISOString() ?? null,
                lastError: n.accessAuditState?.lastError ?? null,
                status: n.accessAuditState?.status ?? {},
            })),
        };
    }
    async setPolicy(userId: number, input: unknown) {
        const b = AuditPolicyBodySchema.parse(input);
        await this.db.$transaction(async (tx) => {
            // Same lock as ingestion: disabling cannot race with a record insert.
            await tx.$queryRaw`SELECT id FROM access_audit_settings WHERE id = 1 FOR UPDATE`;
            if (
                !(await tx.users.findUnique({
                    where: { id: BigInt(userId) },
                    select: { id: true },
                }))
            )
                throw new NotFoundException('User not found');
            const old = await tx.userAccessAuditPolicy.findUnique({
                where: { userId: BigInt(userId) },
            });
            const newlyEnabled = b.enabled && !old?.enabled;
            if (
                newlyEnabled &&
                (await tx.userAccessAuditPolicy.count({ where: { enabled: true } })) >= 10000
            )
                throw new BadRequestException('Access audit supports at most 10000 selected users');
            const data = {
                ...b,
                ...(newlyEnabled ? { windowId: randomUUID(), enabledAt: new Date() } : {}),
            };
            await tx.userAccessAuditPolicy.upsert({
                where: { userId: BigInt(userId) },
                create: { userId: BigInt(userId), ...data },
                update: data,
            });
            await tx.accessAuditSettings.update({
                where: { id: 1 },
                data: { revision: { increment: 1 } },
            });
            await tx.$executeRaw`UPDATE user_access_audit_records SET expires_at = observed_at + ${b.retentionDays} * interval '1 day' WHERE user_id = ${BigInt(userId)}`;
        });
        void this.tick().catch(() => {});
        return this.policy(userId);
    }
    private where(q: z.infer<typeof AuditQuerySchema>): Prisma.UserAccessAuditRecordWhereInput {
        const today = new Date().toISOString().slice(0, 10);
        return {
            ...(q.userId ? { userId: BigInt(q.userId) } : {}),
            ...(q.nodeUuid ? { nodeUuid: q.nodeUuid } : {}),
            ...(q.domain ? { domain: { contains: q.domain, mode: 'insensitive' } } : {}),
            observedAt: {
                gte: new Date((q.start ?? today) + 'T00:00:00Z'),
                lt: new Date(Date.parse((q.end ?? today) + 'T00:00:00Z') + 86400000),
            },
            expiresAt: { gt: new Date() },
        };
    }
    async records(input: unknown) {
        const q = AuditQuerySchema.parse(input);
        const rows = await this.db.userAccessAuditRecord.findMany({
            where: { ...this.where(q), ...(q.cursor ? { id: { lt: BigInt(q.cursor) } } : {}) },
            include: { node: { select: { name: true } }, user: { select: { username: true } } },
            orderBy: { id: 'desc' },
            take: q.limit + 1,
        });
        const selected = rows.slice(0, q.limit);
        return {
            records: selected.map((r) => ({
                id: r.id.toString(),
                userId: Number(r.userId),
                username: r.user.username,
                nodeUuid: r.nodeUuid,
                nodeName: r.node.name,
                domain: r.domain,
                destinationIp: r.destinationIp,
                destinationPort: r.destinationPort,
                inbound: r.inbound,
                network: r.network,
                protocol: r.protocol,
                startedAt: r.startedAt.toISOString(),
                observedAt: r.observedAt.toISOString(),
                closedAt: r.closedAt?.toISOString() ?? null,
                upload: r.uploadBytes.toString(),
                download: r.downloadBytes.toString(),
                partial: r.partial,
            })),
            nextCursor: rows.length > q.limit ? selected.at(-1)!.id.toString() : null,
        };
    }
    async domains(input: unknown) {
        const q = AuditQuerySchema.parse(input);
        const today = new Date().toISOString().slice(0, 10);
        const from = new Date((q.start ?? today) + 'T00:00:00Z');
        const to = new Date(Date.parse((q.end ?? today) + 'T00:00:00Z') + 86400000);
        const rows = await this.db.$queryRaw<
            Array<{
                target: string;
                domain: string;
                connections: bigint;
                upload: string;
                download: string;
            }>
        >(Prisma.sql`
            SELECT COALESCE(NULLIF(domain,''),destination_ip) AS target, MAX(domain) AS domain,
              COUNT(*) AS connections, SUM(upload_bytes)::text AS upload, SUM(download_bytes)::text AS download
            FROM user_access_audit_records WHERE observed_at >= ${from} AND observed_at < ${to} AND expires_at > now()
              ${q.userId ? Prisma.sql`AND user_id = ${BigInt(q.userId)}` : Prisma.empty}
              ${q.nodeUuid ? Prisma.sql`AND node_uuid = ${q.nodeUuid}::uuid` : Prisma.empty}
              ${q.domain ? Prisma.sql`AND POSITION(lower(${q.domain}) IN lower(domain)) > 0` : Prisma.empty}
            GROUP BY COALESCE(NULLIF(domain,''),destination_ip)
            ORDER BY SUM(upload_bytes)+SUM(download_bytes) DESC, target ASC LIMIT 20`);
        return rows.map((r) => ({
            domain: r.domain,
            destinationIp: r.domain ? '' : r.target,
            connections: Number(r.connections),
            upload: r.upload,
            download: r.download,
        }));
    }
    async ingest(nodeUuid: string, input: unknown) {
        const batch = AgentAuditBatchSchema.parse(input);
        await this.db.$transaction(
            async (tx) => {
                await tx.$queryRaw`SELECT id FROM access_audit_settings WHERE id = 1 FOR UPDATE`;
                const policies = await tx.userAccessAuditPolicy.findMany({
                    where: { enabled: true },
                });
                const byId = new Map(policies.map((p) => [p.userId.toString(), p]));
                for (const r of batch.records) {
                    const p = byId.get(r.userId);
                    const observedAt = new Date(r.observedAt);
                    const startedAt = new Date(r.startedAt);
                    if (
                        !p?.enabledAt ||
                        p.windowId !== r.windowId ||
                        observedAt < p.enabledAt ||
                        observedAt.getTime() > Date.now() + 60000 ||
                        startedAt < p.enabledAt ||
                        startedAt > observedAt ||
                        observedAt.getTime() < Date.now() - p.retentionDays * 86400000
                    )
                        continue;
                    const closedAt = r.closedAt ? new Date(r.closedAt) : null;
                    if (
                        closedAt &&
                        (closedAt < startedAt || closedAt.getTime() > observedAt.getTime() + 60000)
                    )
                        continue;
                    const expiresAt = new Date(observedAt.getTime() + p.retentionDays * 86400000);
                    // Absolute values and GREATEST make retries/reconnects/duplicate ACK safe.
                    // Never feed these reference bytes into traffic, quotas or Host usage.
                    await tx.$executeRaw`INSERT INTO user_access_audit_records
                    (user_id,node_uuid,window_id,connection_id,domain,destination_ip,destination_port,inbound,network,protocol,started_at,observed_at,expires_at,closed_at,upload_bytes,download_bytes,partial)
                    VALUES (${p.userId},${nodeUuid}::uuid,${r.windowId}::uuid,${r.connectionId}::uuid,${r.domain},${r.destinationIp},${r.destinationPort},${r.inbound},${r.network},${r.protocol},${startedAt},${observedAt},${expiresAt},${closedAt},${BigInt(r.upload)},${BigInt(r.download)},${r.partial})
                    ON CONFLICT (node_uuid,window_id,connection_id) DO UPDATE SET
                    upload_bytes=GREATEST(user_access_audit_records.upload_bytes,EXCLUDED.upload_bytes),
                    download_bytes=GREATEST(user_access_audit_records.download_bytes,EXCLUDED.download_bytes),
                    observed_at=GREATEST(user_access_audit_records.observed_at,EXCLUDED.observed_at),
                    expires_at=GREATEST(user_access_audit_records.expires_at,EXCLUDED.expires_at),
                    closed_at=COALESCE(EXCLUDED.closed_at,user_access_audit_records.closed_at),
                    partial=user_access_audit_records.partial OR EXCLUDED.partial`;
                }
            },
            { timeout: 20000 },
        );
        return batch;
    }
    async tick() {
        if (this.polling) return;
        this.polling = true;
        try {
            if (Date.now() - this.lastCleanup > 60000) {
                await this.db.userAccessAuditRecord.deleteMany({
                    where: { expiresAt: { lte: new Date() } },
                });
                this.lastCleanup = Date.now();
            }
            const nodes = await this.db.nodes.findMany({
                where: {
                    isConnected: true,
                    isDisabled: false,
                    runtimeInventory: { capabilities: { has: 'user_access_audit_v1' } },
                },
                include: { runtimeInventory: true },
            });
            await this.ensureJwtReady();
            // Bounded concurrency; never put long audit pulls in core health polling.
            for (let i = 0; i < nodes.length; i += 3)
                await Promise.all(
                    nodes.slice(i, i + 3).map(async (n) => {
                        const owner = randomUUID();
                        await this.db.nodeAccessAuditState.upsert({
                            where: { nodeUuid: n.uuid },
                            create: { nodeUuid: n.uuid },
                            update: {},
                        });
                        const claimed = await this.db.nodeAccessAuditState.updateMany({
                            where: {
                                nodeUuid: n.uuid,
                                OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
                            },
                            data: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 90000) },
                        });
                        if (!claimed.count) return;
                        const opts = {
                            address: n.address,
                            port: n.port,
                            proxyUrl: n.proxyUrl,
                            nodeApiSniEnabled: n.nodeApiSniEnabled,
                        };
                        try {
                            const desired = await this.db.$transaction(async (tx) => {
                                await tx.$queryRaw`SELECT id FROM access_audit_settings WHERE id = 1 FOR UPDATE`;
                                let settings = await tx.accessAuditSettings.findUniqueOrThrow({
                                    where: { id: 1 },
                                });
                                const targets = await tx.userAccessAuditPolicy.findMany({
                                    where: { enabled: true },
                                    orderBy: { userId: 'asc' },
                                });
                                const hash = createHash('sha256')
                                    .update(
                                        JSON.stringify(
                                            targets.map((p) => [
                                                p.userId.toString(),
                                                p.windowId,
                                                p.enabledAt,
                                                p.retentionDays,
                                            ]),
                                        ),
                                    )
                                    .digest('hex');
                                // FK-cascade deletion also changes the desired set, even without a policy API call.
                                if (settings.targetsHash !== hash)
                                    settings = await tx.accessAuditSettings.update({
                                        where: { id: 1 },
                                        data: { targetsHash: hash, revision: { increment: 1 } },
                                    });
                                return { settings, targets };
                            });
                            const config = {
                                revision: Number(desired.settings.revision),
                                expiresAt: new Date(Date.now() + 120000).toISOString(),
                                targets: desired.targets.map((p) => ({
                                    userId: p.userId.toString(),
                                    windowId: p.windowId!,
                                    enabledAt: p.enabledAt!.toISOString(),
                                    retentionDays: p.retentionDays,
                                })),
                            };
                            const synced = await this.axios.accessAuditRequest(
                                'config',
                                opts,
                                config,
                            );
                            if (!synced.isOk) throw Error('policy sync');
                            const status = AgentAuditStatusSchema.parse(synced.response);
                            const pulled = await this.axios.accessAuditRequest('pull', opts, {
                                limit: 200,
                            });
                            if (!pulled.isOk) throw Error('record pull');
                            const batch = await this.ingest(n.uuid, pulled.response);
                            if (batch.records.length) {
                                const ack = await this.axios.accessAuditRequest('ack', opts, {
                                    generation: batch.generation,
                                    throughSequence: Math.max(
                                        ...batch.records.map((r) => r.sequence),
                                    ),
                                });
                                if (!ack.isOk) throw Error('ack');
                            }
                            await this.db.nodeAccessAuditState.updateMany({
                                where: { nodeUuid: n.uuid, leaseOwner: owner },
                                data: {
                                    syncedAt: new Date(),
                                    lastError: null,
                                    status: status as unknown as Prisma.InputJsonValue,
                                },
                            });
                        } catch {
                            await this.db.nodeAccessAuditState.updateMany({
                                where: { nodeUuid: n.uuid, leaseOwner: owner },
                                data: {
                                    lastError:
                                        'Audit sync interrupted; gaps may exist. Existing proxy traffic is unaffected.',
                                },
                            });
                        } finally {
                            await this.db.nodeAccessAuditState.updateMany({
                                where: { nodeUuid: n.uuid, leaseOwner: owner },
                                data: { leaseOwner: null, leaseUntil: null },
                            });
                        }
                    }),
                );
        } finally {
            this.polling = false;
        }
    }
}
