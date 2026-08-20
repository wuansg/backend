import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { GetSystemStatsCommand } from '@remnawave/node-contract';

import { AxiosService, INodeConnectionOpts, NodeAgentHealthResponse } from '@common/axios';
import { RawCacheService } from '@common/raw-cache';
import { CACHE_KEYS, CACHE_KEYS_TTL, EVENTS } from '@libs/contracts/constants';

import { NodeEvent } from '@integration-modules/notifications/interfaces';

import { UpdateNodeCommand } from '@modules/nodes/commands/update-node';

import { NodesQueuesService } from '@queue/_nodes';
import { QUEUES_NAMES } from '@queue/queue.enum';

import { NODES_JOB_NAMES } from '../constants/nodes-job-name.constant';
import { INodeHealthCheckPayload } from '../interfaces';
import { resolveNodeRuntimeStatus } from '../node-runtime-status.util';

@Processor(QUEUES_NAMES.NODES.HEALTH_CHECK, {
    concurrency: 40,
})
export class NodeHealthCheckQueueProcessor extends WorkerHost {
    private readonly logger = new Logger(NodeHealthCheckQueueProcessor.name);

    constructor(
        private readonly commandBus: CommandBus,
        private readonly eventEmitter: EventEmitter2,
        private readonly axios: AxiosService,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly rawCacheService: RawCacheService,
    ) {
        super();
    }
    async process(job: Job<INodeHealthCheckPayload>) {
        try {
            const { nodeUuid, isConnected, expectsCore, connectionOpts } = job.data;

            const healthResult = await this.axios.getNodeHealth(connectionOpts);
            if (!healthResult.isOk) {
                return await this.handleDisconnectedNode(
                    nodeUuid,
                    isConnected,
                    healthResult.message ?? 'Node agent is unavailable',
                );
            }
            if (!healthResult.response.isAlive) {
                return await this.handleDisconnectedNode(
                    nodeUuid,
                    isConnected,
                    'Node agent reported that it is not alive',
                );
            }

            const runtimeStatus = resolveNodeRuntimeStatus(healthResult.response, expectsCore);
            await this.cacheRuntimeStatus(nodeUuid, runtimeStatus);

            if (!expectsCore) {
                return await this.handleCorelessNode(healthResult.response, nodeUuid, isConnected);
            }

            if (!runtimeStatus.coreOnline) {
                return await this.handleDegradedCore(
                    nodeUuid,
                    isConnected,
                    runtimeStatus,
                    'Node agent is online, but the configured core is unavailable',
                );
            }

            const attemptsLimit = 2;
            let attempts = 0;

            let message = '';

            while (attempts < attemptsLimit) {
                const statResult = await this.axios.getSystemStats(connectionOpts);

                switch (statResult.isOk) {
                    case true:
                        return await this.handleConnectedNode(
                            connectionOpts,
                            nodeUuid,
                            isConnected,
                            statResult.response,
                            runtimeStatus,
                        );
                    case false:
                        message = statResult.message ?? 'Unknown error';
                        attempts++;

                        if (attempts < attemptsLimit) {
                            this.logger.debug(
                                `Node ${nodeUuid}, ${connectionOpts.address}:${connectionOpts.port} – health check attempt ${attempts} of ${attemptsLimit}, message: ${message}`,
                            );
                            await new Promise((resolve) => setTimeout(resolve, 500));
                        }

                        continue;
                    default:
                        message = 'Unknown error';
                        attempts++;
                        if (attempts < attemptsLimit) {
                            this.logger.debug(
                                `Node ${nodeUuid}, ${connectionOpts.address}:${connectionOpts.port} – health check attempt ${attempts} of ${attemptsLimit}, message: ${message}`,
                            );
                            await new Promise((resolve) => setTimeout(resolve, 500));
                        }
                        continue;
                }
            }

            return await this.handleDegradedCore(nodeUuid, isConnected, runtimeStatus, message);
        } catch (error) {
            this.logger.error(
                `Error handling "${NODES_JOB_NAMES.NODE_HEALTH_CHECK}" job: ${error}`,
            );
            return;
        }
    }

    private async handleCorelessNode(
        health: NodeAgentHealthResponse,
        nodeUuid: string,
        isConnected: boolean,
    ) {
        await this.rawCacheService.delMany([
            CACHE_KEYS.NODE_SYSTEM_STATS(nodeUuid),
            CACHE_KEYS.NODE_USERS_ONLINE(nodeUuid),
            CACHE_KEYS.NODE_XRAY_UPTIME(nodeUuid),
        ]);

        if (health.xrayInternalStatusCached) {
            this.logger.warn(
                `Node ${nodeUuid} has no active inbounds but a core is running; scheduling core stop.`,
            );
            await this.nodesQueuesService.startNode({ nodeUuid });
        }

        return await this.markAgentConnected(nodeUuid, isConnected);
    }

    private async handleConnectedNode(
        connectionOpts: INodeConnectionOpts,
        nodeUuid: string,
        isConnected: boolean,
        stats: GetSystemStatsCommand.Response['response'],
        runtimeStatus: ReturnType<typeof resolveNodeRuntimeStatus>,
    ) {
        if (stats.xrayInfo === null) {
            this.logger.error(`Node ${nodeUuid} – xrayInfo is null`);

            return await this.handleDegradedCore(
                nodeUuid,
                isConnected,
                runtimeStatus,
                'Required core info is missing. Outdated node agent?',
            );
        }

        await this.rawCacheService.setMany([
            {
                key: CACHE_KEYS.NODE_SYSTEM_STATS(nodeUuid),
                value: stats.system.stats,
                ttlSeconds: CACHE_KEYS_TTL.NODE_SYSTEM_STATS,
            },
            {
                key: CACHE_KEYS.NODE_XRAY_UPTIME(nodeUuid),
                value: stats.xrayInfo.uptime,
                ttlSeconds: CACHE_KEYS_TTL.NODE_XRAY_UPTIME,
            },
        ]);

        const reports = stats.plugins.torrentBlocker.reportsCount;
        if (reports !== undefined && reports > 0) {
            await this.nodesQueuesService.collectReports({
                nodeUuid,
                connectionOpts,
            });

            this.logger.log(`Node ${nodeUuid} has ${reports} reports, collecting reports...`);
        }

        if (!isConnected) {
            const nodeUpdatedResponse = await this.commandBus.execute(
                new UpdateNodeCommand({
                    uuid: nodeUuid,
                    isConnected: true,
                }),
            );

            if (!nodeUpdatedResponse.isOk) {
                return;
            }

            await this.nodesQueuesService.startNode({ nodeUuid });

            this.eventEmitter.emit(
                EVENTS.NODE.CONNECTION_RESTORED,
                new NodeEvent(nodeUpdatedResponse.response, EVENTS.NODE.CONNECTION_RESTORED),
            );
        }

        return;
    }

    private async cacheRuntimeStatus(
        nodeUuid: string,
        runtimeStatus: ReturnType<typeof resolveNodeRuntimeStatus>,
    ): Promise<void> {
        await this.rawCacheService.set(
            CACHE_KEYS.NODE_RUNTIME_STATUS(nodeUuid),
            runtimeStatus,
            CACHE_KEYS_TTL.NODE_RUNTIME_STATUS,
        );
    }

    private async handleDegradedCore(
        nodeUuid: string,
        isConnected: boolean,
        runtimeStatus: ReturnType<typeof resolveNodeRuntimeStatus>,
        message: string,
    ): Promise<void> {
        await Promise.all([
            this.cacheRuntimeStatus(nodeUuid, {
                ...runtimeStatus,
                mode: 'DEGRADED',
                coreOnline: false,
            }),
            this.rawCacheService.delMany([
                CACHE_KEYS.NODE_SYSTEM_STATS(nodeUuid),
                CACHE_KEYS.NODE_USERS_ONLINE(nodeUuid),
                CACHE_KEYS.NODE_XRAY_UPTIME(nodeUuid),
            ]),
        ]);

        await this.markAgentConnected(nodeUuid, isConnected, message);
        await this.nodesQueuesService.startNode({ nodeUuid });

        const logMessage = `Node agent ${nodeUuid} is online but its core is degraded: ${message}`;
        if (isConnected) this.logger.debug(logMessage);
        else this.logger.warn(logMessage);
    }

    private async markAgentConnected(
        nodeUuid: string,
        isConnected: boolean,
        message: string | null = null,
    ): Promise<void> {
        if (isConnected) return;

        const nodeUpdatedResponse = await this.commandBus.execute(
            new UpdateNodeCommand({
                uuid: nodeUuid,
                isConnected: true,
                isConnecting: false,
                lastStatusMessage: message,
                lastStatusChange: new Date(),
            }),
        );

        if (!nodeUpdatedResponse.isOk) return;

        this.eventEmitter.emit(
            EVENTS.NODE.CONNECTION_RESTORED,
            new NodeEvent(nodeUpdatedResponse.response, EVENTS.NODE.CONNECTION_RESTORED),
        );
    }

    private async handleDisconnectedNode(
        nodeUuid: string,
        isConnected: boolean,
        message: string | undefined,
    ) {
        await this.rawCacheService.delMany([
            CACHE_KEYS.NODE_SYSTEM_INFO(nodeUuid),
            CACHE_KEYS.NODE_USERS_ONLINE(nodeUuid),
            CACHE_KEYS.NODE_XRAY_UPTIME(nodeUuid),
            CACHE_KEYS.NODE_RUNTIME_STATUS(nodeUuid),
        ]);

        const newNodeEntity = await this.commandBus.execute(
            new UpdateNodeCommand({
                uuid: nodeUuid,
                isConnected: false,
                lastStatusChange: new Date(),
                lastStatusMessage: message,
            }),
        );

        if (!newNodeEntity.isOk) {
            return;
        }

        await this.nodesQueuesService.startNode({ nodeUuid });

        if (isConnected) {
            this.eventEmitter.emit(
                EVENTS.NODE.CONNECTION_LOST,
                new NodeEvent(newNodeEntity.response, EVENTS.NODE.CONNECTION_LOST),
            );
        }

        const logMessage = `Lost connection to Node ${nodeUuid}, ${newNodeEntity.response.address}:${newNodeEntity.response.port}, message: ${message}`;
        if (isConnected) this.logger.warn(logMessage);
        else this.logger.debug(logMessage);

        return;
    }
}
