import { Prisma, NodeBenchmark } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    OnApplicationBootstrap,
    OnApplicationShutdown,
} from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { PrismaService } from '@common/database/prisma.service';
import {
    BenchmarkRequestSchema,
    BenchmarkTargetSchema,
    BenchmarkItemSchema,
} from '@libs/contracts/commands';

import { DEFAULT_BENCHMARK_TARGETS } from './targets';

const ACTIVE = ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'];
const asJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const AgentJob = z.object({
    id: z.uuid(),
    status: z.enum(['RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED', 'INTERRUPTED']),
    phase: z.string().max(256),
    progress: z.number().min(0).max(100),
    results: z.array(BenchmarkItemSchema).max(12),
    message: z.string().max(512).optional(),
});
@Injectable()
export class NodeBenchmarksService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(NodeBenchmarksService.name);
    private timer?: NodeJS.Timeout;
    private polling = false;
    private jwtReady?: Promise<void>;
    constructor(
        private readonly db: PrismaService,
        private readonly axios: AxiosService,
    ) {}
    onApplicationBootstrap() {
        this.timer = setInterval(() => {
            void this.tick().catch((e) => this.logger.error(e));
        }, 2000);
        this.timer.unref();
    }
    onApplicationShutdown() {
        if (this.timer) clearInterval(this.timer);
    }
    private async ensureJwtReady() {
        // Benchmarks execute in REST, unlike the queue workers which initialize
        // Axios auth in processors.ts. Share one in-flight initialization and
        // allow a later retry if key generation/auth initialization fails.
        this.jwtReady ??= this.axios.setJwt().catch((error) => {
            this.jwtReady = undefined;
            throw error;
        });
        await this.jwtReady;
    }
    async targets() {
        const overrides = await this.db.benchmarkTarget.findMany();
        return DEFAULT_BENCHMARK_TARGETS.map((t) =>
            BenchmarkTargetSchema.parse(overrides.find((o) => o.id === t.id)?.config || t),
        );
    }
    async updateTarget(id: string, input: unknown) {
        const config = BenchmarkTargetSchema.parse(input);
        if (config.id !== id) throw new BadRequestException('Target ID mismatch');
        await this.db.benchmarkTarget.upsert({
            where: { id },
            create: { id, config: asJson(config) },
            update: { config: asJson(config) },
        });
        return config;
    }
    private view(j: NodeBenchmark) {
        const result = j.result as Record<string, unknown>;
        return {
            id: j.id,
            nodeUuid: j.nodeUuid,
            kind: j.kind,
            status: j.status,
            phase: result.phase || j.status,
            progress: result.progress || 0,
            request: j.request,
            results: result.results || [],
            message: j.message,
            createdAt: j.createdAt.toISOString(),
            finishedAt: j.finishedAt?.toISOString() || null,
        };
    }
    async create(nodeUuid: string, input: unknown) {
        const request = BenchmarkRequestSchema.parse(input);
        const n = await this.db.nodes.findUnique({
            where: { uuid: nodeUuid },
            include: { runtimeInventory: true },
        });
        if (!n) throw new NotFoundException('Node not found');
        if (!n.isConnected || n.isDisabled)
            throw new BadRequestException('Node is offline or disabled');
        if (!n.runtimeInventory?.capabilities.includes('node_benchmarks_v1'))
            throw new BadRequestException('Requires a benchmark-capable Node Agent');
        const targets =
            request.kind === 'NETWORK'
                ? (await this.targets()).filter((t) => request.cities.includes(t.id))
                : [];
        const id = randomUUID();
        const agentRequest = { ...request, id, targets };
        try {
            const j = await this.db.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(651503)`;
                if (await tx.nodeBenchmark.count({ where: { nodeUuid, status: { in: ACTIVE } } }))
                    throw new ConflictException('Node already has an active benchmark');
                return tx.nodeBenchmark.create({
                    data: {
                        id,
                        nodeUuid,
                        kind: request.kind,
                        status: 'QUEUED',
                        request: asJson(agentRequest),
                    },
                });
            });
            const stale = await this.db.nodeBenchmark.findMany({
                where: { nodeUuid, status: { notIn: ACTIVE } },
                orderBy: { createdAt: 'desc' },
                skip: 99,
                select: { id: true },
            });
            await this.db.nodeBenchmark.deleteMany({
                where: {
                    status: { notIn: ACTIVE },
                    OR: [
                        { id: { in: stale.map((j) => j.id) } },
                        { createdAt: { lt: new Date(Date.now() - 90 * 86400000) } },
                    ],
                },
            });
            void this.tick().catch((e) => this.logger.error(e));
            return this.view(j);
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                throw new ConflictException('Node already has an active benchmark');
            throw e;
        }
    }
    async list(nodeUuid: string) {
        return (
            await this.db.nodeBenchmark.findMany({
                where: { nodeUuid },
                orderBy: { createdAt: 'desc' },
                take: 100,
            })
        ).map((j) => this.view(j));
    }
    async get(nodeUuid: string, id: string) {
        const j = await this.db.nodeBenchmark.findFirst({ where: { id, nodeUuid } });
        if (!j) throw new NotFoundException('Benchmark not found');
        return this.view(j);
    }
    async cancel(nodeUuid: string, id: string) {
        await this.db.nodeBenchmark.updateMany({
            where: { id, nodeUuid, status: 'QUEUED' },
            data: { status: 'CANCELLED', finishedAt: new Date() },
        });
        await this.db.nodeBenchmark.updateMany({
            where: { id, nodeUuid, status: 'RUNNING' },
            data: { status: 'CANCEL_REQUESTED' },
        });
        return this.get(nodeUuid, id);
    }
    async tick() {
        if (this.polling) return;
        this.polling = true;
        try {
            const owner = randomUUID();
            const now = new Date();
            const tasks = await this.db.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(651503)`;
                const running = await tx.nodeBenchmark.findMany({
                    where: { status: { in: ['RUNNING', 'CANCEL_REQUESTED'] } },
                });
                const queued = await tx.nodeBenchmark.findMany({
                    where: { status: 'QUEUED' },
                    orderBy: { createdAt: 'asc' },
                    take: Math.max(0, 2 - running.length),
                });
                const claim = [
                    ...running.filter((j) => !j.leaseUntil || j.leaseUntil <= now),
                    ...queued,
                ];
                const claimed: NodeBenchmark[] = [];
                for (const j of claim) {
                    const changed = await tx.nodeBenchmark.updateMany({
                        where: { id: j.id, status: j.status },
                        data: {
                            status: j.status === 'QUEUED' ? 'RUNNING' : j.status,
                            startedAt: j.startedAt || now,
                            leaseOwner: owner,
                            leaseUntil: new Date(Date.now() + 45000),
                        },
                    });
                    if (changed.count) claimed.push({ ...j, startedAt: j.startedAt || now });
                }
                return claimed;
            });
            await Promise.all(tasks.map((j) => this.poll(j, owner)));
        } finally {
            this.polling = false;
        }
    }
    private async poll(j: NodeBenchmark, owner: string) {
        try {
            const n = await this.db.nodes.findUniqueOrThrow({ where: { uuid: j.nodeUuid } });
            const opts = {
                address: n.address,
                port: n.port,
                proxyUrl: n.proxyUrl,
                nodeApiSniEnabled: n.nodeApiSniEnabled,
            };
            await this.ensureJwtReady();
            // POST start is idempotent: after timeout or coordinator restart, the same ID
            // retrieves the original Agent job without repeating a test.
            const start = await this.axios.benchmarkRequest('start', opts, j.request);
            if (!start.isOk) throw new Error('Agent temporarily unavailable');
            let raw = start.response;
            const current = await this.db.nodeBenchmark.findUniqueOrThrow({ where: { id: j.id } });
            if (current.status === 'CANCEL_REQUESTED') {
                await this.axios.benchmarkRequest('cancel', opts, { id: j.id });
                const response = await this.axios.benchmarkRequest(j.id, opts);
                if (response.isOk) raw = response.response;
            }
            if (JSON.stringify(raw).length > 512 * 1024) throw new Error('Result exceeds limit');
            const result = AgentJob.parse(raw);
            if (result.id !== j.id) throw new Error('Agent task ID mismatch');
            const terminal = result.status !== 'RUNNING';
            // Do not write RUNNING back: a cancellation may arrive between the
            // status read above and this update. Only terminal Agent states can
            // replace CANCEL_REQUESTED.
            await this.db.nodeBenchmark.updateMany({
                where: { id: j.id, leaseOwner: owner },
                data: {
                    ...(terminal ? { status: result.status } : {}),
                    result: asJson(result),
                    message: result.message || null,
                    finishedAt: terminal ? new Date() : null,
                    leaseUntil: null,
                    leaseOwner: null,
                },
            });
        } catch {
            // Keep the slot while recovering a potentially still-running Agent job.
            // The Agent deadline is ten minutes; only fail after that deadline plus grace.
            const expired = Date.now() - (j.startedAt || j.createdAt).getTime() > 12 * 60000;
            await this.db.nodeBenchmark.updateMany({
                where: { id: j.id, leaseOwner: owner },
                data: {
                    ...(expired ? { status: 'FAILED', finishedAt: new Date() } : {}),
                    message: expired
                        ? 'Agent task deadline exceeded'
                        : 'Waiting for Agent response',
                    leaseUntil: new Date(Date.now() + 10000),
                    leaseOwner: null,
                },
            });
        }
    }
}
