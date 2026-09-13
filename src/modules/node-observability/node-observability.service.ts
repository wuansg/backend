import { Prisma } from '@prisma/client';
import { isIP } from 'node:net';

import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '@common/database/prisma.service';
import { fail, ok, TResult } from '@common/types';
import { UpdateNodeGeocheckCommand } from '@libs/contracts/commands';
import { ERRORS } from '@libs/contracts/constants';

import { NodeObservabilityRepository } from './node-observability.repository';

@Injectable()
export class NodeObservabilityService {
    private readonly logger = new Logger(NodeObservabilityService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly repository: NodeObservabilityRepository,
    ) {}

    public async get(nodeUuid: string): Promise<TResult<Record<string, unknown>>> {
        try {
            const node = await this.prisma.nodes.findUnique({
                where: { uuid: nodeUuid },
                select: {
                    uuid: true,
                    geocheckIntervalMinutes: true,
                    geocheckSource: true,
                    geocheckCooldownMinutes: true,
                    lastGeocheckScheduledAt: true,
                },
            });
            if (!node) return fail(ERRORS.NODE_NOT_FOUND);
            const data = await this.repository.getNodeObservability(nodeUuid);
            return ok({
                schedule: {
                    intervalMinutes: node.geocheckIntervalMinutes,
                    source: node.geocheckSource,
                    cooldownMinutes: node.geocheckCooldownMinutes,
                    lastScheduledAt: node.lastGeocheckScheduledAt?.toISOString() ?? null,
                },
                network: data.network
                    ? {
                          interfaces: data.network.interfaces,
                          reportedAt: data.network.reportedAt.toISOString(),
                      }
                    : null,
                plugin: data.plugin ? serializeDates(data.plugin) : null,
                history: data.history.map((item) => ({
                    ...serializeDates(item),
                    id: item.id.toString(),
                })),
                driftEvents: data.driftEvents.map((item) => ({
                    ...serializeDates(item),
                    id: item.id.toString(),
                })),
            });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async updateGeocheck(
        nodeUuid: string,
        input: UpdateNodeGeocheckCommand.RequestBody,
    ): Promise<TResult<Record<string, unknown>>> {
        try {
            if (input.source?.type === 'IP' && isIP(input.source.value) === 0) {
                return fail({
                    ...ERRORS.INTERNAL_SERVER_ERROR,
                    message: 'Invalid Geocheck source IP.',
                });
            }
            if (
                input.source?.type === 'INTERFACE' &&
                !/^[a-zA-Z0-9_.:@-]{1,64}$/.test(input.source.value)
            ) {
                return fail({
                    ...ERRORS.INTERNAL_SERVER_ERROR,
                    message: 'Invalid network interface name.',
                });
            }
            const updated = await this.prisma.nodes.update({
                where: { uuid: nodeUuid },
                data: {
                    geocheckIntervalMinutes: input.intervalMinutes,
                    geocheckSource:
                        input.source === null
                            ? Prisma.DbNull
                            : (input.source as Prisma.InputJsonValue),
                    geocheckCooldownMinutes: input.cooldownMinutes,
                },
                select: {
                    geocheckIntervalMinutes: true,
                    geocheckSource: true,
                    geocheckCooldownMinutes: true,
                },
            });
            return ok({
                intervalMinutes: updated.geocheckIntervalMinutes,
                source: updated.geocheckSource,
                cooldownMinutes: updated.geocheckCooldownMinutes,
            });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.NODE_NOT_FOUND);
        }
    }

    public async acknowledgeDrift(
        nodeUuid: string,
        eventId: string,
    ): Promise<TResult<{ acknowledged: boolean }>> {
        try {
            return ok({
                acknowledged: await this.repository.acknowledgeDrift(nodeUuid, BigInt(eventId)),
            });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

function serializeDates<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
            key,
            item instanceof Date ? item.toISOString() : item,
        ]),
    );
}
