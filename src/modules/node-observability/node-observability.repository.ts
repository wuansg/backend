import { Prisma } from '@prisma/client';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '@common/database/prisma.service';

export type PluginDeploymentState = 'PENDING' | 'APPLIED' | 'FAILED' | 'ROLLED_BACK' | 'DRIFT';

export interface PluginAgentState {
    configHash: string;
    activePlugin: { uuid: string; name: string } | null;
    appliedAt?: string;
    lastAttemptAt?: string;
    lastError?: string;
    domainResolutions?: Record<string, unknown>;
}

export interface NetworkInterfaceObservation {
    name: string;
    index: number;
    mtu: number;
    flags: string[];
    addresses: Array<{
        address: string;
        prefix: number;
        family: 'IPv4' | 'IPv6';
    }>;
    defaultRoute: boolean;
}

export interface GeocheckSnapshot {
    exitIp: string | null;
    asn: string | null;
    country: string | null;
    networkType: string | null;
}

export interface GeocheckChange {
    kind: keyof GeocheckSnapshot;
    previousValue: string | null;
    currentValue: string | null;
}

const MAX_ERROR_LENGTH = 2_000;
const MAX_GEOCHECK_REPORT_BYTES = 512 * 1024;
const MAX_GEOCHECK_HISTORY = 50;
const MAX_GEOCHECK_DRIFT_EVENTS = 100;
const GEOCHECK_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const GEOCHECK_DRIFT_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;

@Injectable()
export class NodeObservabilityRepository {
    constructor(private readonly prisma: PrismaService) {}

    public async markPluginPending(
        nodeUuid: string,
        pluginUuid: string | null,
        desiredHash: string,
    ): Promise<void> {
        const now = new Date();
        await this.prisma.nodePluginDeployment.upsert({
            where: { nodeUuid },
            create: {
                nodeUuid,
                pluginUuid,
                desiredHash,
                state: 'PENDING',
                lastAttemptAt: now,
                checkedAt: now,
            },
            update: {
                pluginUuid,
                desiredHash,
                state: 'PENDING',
                lastError: null,
                lastAttemptAt: now,
                checkedAt: now,
                rolledBack: false,
            },
        });
    }

    public async markPluginResult(
        nodeUuid: string,
        result: {
            accepted: boolean;
            configHash?: string;
            appliedAt?: string;
            error?: string;
            rolledBack?: boolean;
        },
    ): Promise<void> {
        const rolledBack = result.rolledBack === true;
        const state: PluginDeploymentState = result.accepted
            ? 'APPLIED'
            : rolledBack
              ? 'ROLLED_BACK'
              : 'FAILED';
        await this.prisma.nodePluginDeployment.update({
            where: { nodeUuid },
            data: {
                state,
                appliedHash: result.accepted ? (result.configHash ?? '') : undefined,
                appliedAt:
                    result.accepted && result.appliedAt ? new Date(result.appliedAt) : undefined,
                lastAttemptAt: new Date(),
                checkedAt: new Date(),
                rolledBack,
                lastError: result.error?.slice(0, MAX_ERROR_LENGTH) ?? null,
            },
        });
    }

    public async markPluginFailure(nodeUuid: string, error: string): Promise<void> {
        await this.prisma.nodePluginDeployment.updateMany({
            where: { nodeUuid },
            data: {
                state: 'FAILED',
                lastAttemptAt: new Date(),
                checkedAt: new Date(),
                lastError: error.slice(0, MAX_ERROR_LENGTH),
            },
        });
    }

    public async recordNodeHealth(
        nodeUuid: string,
        observation: {
            plugin?: PluginAgentState;
            networkInterfaces?: NetworkInterfaceObservation[];
        },
    ): Promise<void> {
        const now = new Date();
        const writes: Array<Promise<unknown>> = [];

        if (observation.networkInterfaces) {
            writes.push(
                this.prisma.nodeNetworkInventory.upsert({
                    where: { nodeUuid },
                    create: {
                        nodeUuid,
                        interfaces:
                            observation.networkInterfaces as unknown as Prisma.InputJsonValue,
                        reportedAt: now,
                    },
                    update: {
                        interfaces:
                            observation.networkInterfaces as unknown as Prisma.InputJsonValue,
                        reportedAt: now,
                    },
                }),
            );
        }

        if (observation.plugin) {
            const plugin = observation.plugin;
            const current = await this.prisma.nodePluginDeployment.findUnique({
                where: { nodeUuid },
                select: { desiredHash: true },
            });
            const desiredHash = current?.desiredHash ?? plugin.configHash;
            const state: PluginDeploymentState = plugin.lastError
                ? 'FAILED'
                : desiredHash === plugin.configHash
                  ? 'APPLIED'
                  : 'DRIFT';
            writes.push(
                this.prisma.nodePluginDeployment.upsert({
                    where: { nodeUuid },
                    create: {
                        nodeUuid,
                        pluginUuid: plugin.activePlugin?.uuid ?? null,
                        desiredHash,
                        appliedHash: plugin.configHash,
                        state,
                        lastError: plugin.lastError?.slice(0, MAX_ERROR_LENGTH) ?? null,
                        resolutionState: (plugin.domainResolutions ?? {}) as Prisma.InputJsonValue,
                        lastAttemptAt: parseDate(plugin.lastAttemptAt),
                        appliedAt: parseDate(plugin.appliedAt),
                        checkedAt: now,
                    },
                    update: {
                        pluginUuid: plugin.activePlugin?.uuid ?? null,
                        appliedHash: plugin.configHash,
                        state,
                        lastError: plugin.lastError?.slice(0, MAX_ERROR_LENGTH) ?? null,
                        resolutionState: (plugin.domainResolutions ?? {}) as Prisma.InputJsonValue,
                        lastAttemptAt: parseDate(plugin.lastAttemptAt),
                        appliedAt: parseDate(plugin.appliedAt),
                        checkedAt: now,
                    },
                }),
            );
        }

        await Promise.all(writes);
    }

    public async getPluginStatus(pluginUuid: string) {
        return this.prisma.nodePluginDeployment.findMany({
            where: { pluginUuid },
            include: {
                node: {
                    select: {
                        uuid: true,
                        name: true,
                        isConnected: true,
                        countryCode: true,
                    },
                },
            },
            orderBy: { node: { name: 'asc' } },
        });
    }

    public async getNodeObservability(nodeUuid: string) {
        const [network, plugin, history, driftEvents] = await Promise.all([
            this.prisma.nodeNetworkInventory.findUnique({ where: { nodeUuid } }),
            this.prisma.nodePluginDeployment.findUnique({ where: { nodeUuid } }),
            this.prisma.nodeGeocheckHistory.findMany({
                where: { nodeUuid },
                orderBy: { createdAt: 'desc' },
                take: MAX_GEOCHECK_HISTORY,
            }),
            this.prisma.nodeGeocheckDriftEvent.findMany({
                where: { nodeUuid },
                orderBy: { createdAt: 'desc' },
                take: MAX_GEOCHECK_HISTORY,
            }),
        ]);
        return { network, plugin, history, driftEvents };
    }

    public async acknowledgeDrift(nodeUuid: string, eventId: bigint): Promise<boolean> {
        const result = await this.prisma.nodeGeocheckDriftEvent.updateMany({
            where: { id: eventId, nodeUuid, acknowledgedAt: null },
            data: { acknowledgedAt: new Date(), notificationDue: false },
        });
        return result.count > 0;
    }

    public async recordGeocheck(
        nodeUuid: string,
        source: { ip?: string; interface?: string },
        result: {
            success: boolean;
            rawReport: Record<string, unknown> | null;
            message: string | null;
        },
    ): Promise<{ snapshot: GeocheckSnapshot | null; changes: GeocheckChange[] }> {
        const previous = await this.prisma.nodeGeocheckHistory.findFirst({
            where: { nodeUuid, success: true },
            orderBy: { createdAt: 'desc' },
            select: { snapshot: true },
        });
        const snapshot = result.success ? extractGeocheckSnapshot(result.rawReport) : null;
        const previousSnapshot = normalizeSnapshot(previous?.snapshot);
        const changes = snapshot ? diffGeocheckSnapshots(previousSnapshot, snapshot) : [];
        const sourceType = source.ip ? 'IP' : source.interface ? 'INTERFACE' : 'DEFAULT';
        const sourceValue = source.ip ?? source.interface ?? null;
        const report = clampJson(result.rawReport, MAX_GEOCHECK_REPORT_BYTES);
        const node = await this.prisma.nodes.findUnique({
            where: { uuid: nodeUuid },
            select: { geocheckCooldownMinutes: true },
        });
        const cooldownSince = new Date(
            Date.now() - Math.max(1, node?.geocheckCooldownMinutes ?? 60) * 60_000,
        );

        await this.prisma.$transaction(async (tx) => {
            await tx.nodeGeocheckHistory.create({
                data: {
                    nodeUuid,
                    sourceType,
                    sourceValue,
                    success: result.success,
                    report: report as Prisma.InputJsonValue | undefined,
                    snapshot: snapshot as unknown as Prisma.InputJsonValue | undefined,
                    changes: changes as unknown as Prisma.InputJsonValue,
                    message: result.message?.slice(0, MAX_ERROR_LENGTH) ?? null,
                },
            });

            for (const change of changes) {
                const recent = await tx.nodeGeocheckDriftEvent.findFirst({
                    where: {
                        nodeUuid,
                        kind: change.kind,
                        currentValue: change.currentValue,
                        createdAt: { gte: cooldownSince },
                    },
                    select: { id: true },
                });
                if (!recent) {
                    await tx.nodeGeocheckDriftEvent.create({
                        data: {
                            nodeUuid,
                            kind: change.kind,
                            previousValue: change.previousValue,
                            currentValue: change.currentValue,
                        },
                    });
                }
            }

            const retained = await tx.nodeGeocheckHistory.findMany({
                where: { nodeUuid },
                orderBy: { createdAt: 'desc' },
                skip: MAX_GEOCHECK_HISTORY,
                select: { id: true },
            });
            await tx.nodeGeocheckHistory.deleteMany({
                where: {
                    OR: [
                        { id: { in: retained.map(({ id }) => id) } },
                        { createdAt: { lt: new Date(Date.now() - GEOCHECK_RETENTION_MS) } },
                    ],
                },
            });

            const retainedDrifts = await tx.nodeGeocheckDriftEvent.findMany({
                where: { nodeUuid },
                orderBy: { createdAt: 'desc' },
                skip: MAX_GEOCHECK_DRIFT_EVENTS,
                select: { id: true },
            });
            await tx.nodeGeocheckDriftEvent.deleteMany({
                where: {
                    nodeUuid,
                    OR: [
                        { id: { in: retainedDrifts.map(({ id }) => id) } },
                        {
                            acknowledgedAt: { not: null },
                            createdAt: {
                                lt: new Date(Date.now() - GEOCHECK_DRIFT_RETENTION_MS),
                            },
                        },
                    ],
                },
            });
        });

        return { snapshot, changes };
    }
}

function parseDate(value?: string): Date | null | undefined {
    if (!value) return value === undefined ? undefined : null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clampJson(value: unknown, maxBytes: number): unknown {
    if (value === null || value === undefined) return undefined;
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded, 'utf8') <= maxBytes) return value;
    return {
        truncated: true,
        originalBytes: Buffer.byteLength(encoded, 'utf8'),
        message: `Report exceeded ${maxBytes} bytes and was not persisted in full.`,
    };
}

function normalizeSnapshot(value: unknown): GeocheckSnapshot | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    return {
        exitIp: stringOrNull(record.exitIp),
        asn: stringOrNull(record.asn),
        country: stringOrNull(record.country),
        networkType: stringOrNull(record.networkType),
    };
}

export function extractGeocheckSnapshot(report: unknown): GeocheckSnapshot {
    const flat = flattenObject(report);
    return {
        exitIp: firstValue(flat, ['ip', 'exit_ip', 'exitip', 'public_ip', 'publicip']),
        asn: firstValue(flat, ['asn', 'as_number', 'asnumber']),
        country: firstValue(flat, ['country_code', 'countrycode', 'country', 'region_code']),
        networkType: firstValue(flat, [
            'network_type',
            'networktype',
            'connection_type',
            'connectiontype',
            'type',
        ]),
    };
}

export function diffGeocheckSnapshots(
    previous: GeocheckSnapshot | null,
    current: GeocheckSnapshot,
): GeocheckChange[] {
    if (!previous) return [];
    const keys: Array<keyof GeocheckSnapshot> = ['exitIp', 'asn', 'country', 'networkType'];
    return keys
        .filter((key) => previous[key] !== current[key] && current[key] !== null)
        .map((key) => ({
            kind: key,
            previousValue: previous[key],
            currentValue: current[key],
        }));
}

function flattenObject(value: unknown, output = new Map<string, unknown>()): Map<string, unknown> {
    if (Array.isArray(value)) {
        value.forEach((item) => flattenObject(item, output));
        return output;
    }
    if (!value || typeof value !== 'object') return output;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        const normalized = key.toLowerCase().replaceAll('-', '_');
        if (!output.has(normalized) && nested !== null && nested !== '') {
            output.set(normalized, nested);
        }
        flattenObject(nested, output);
    }
    return output;
}

function firstValue(flat: Map<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = stringOrNull(flat.get(key));
        if (value !== null) return value;
    }
    return null;
}

function stringOrNull(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
}
