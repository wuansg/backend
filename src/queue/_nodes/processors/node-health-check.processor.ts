import { Job } from 'bullmq';
import semver from 'semver';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
    AxiosService,
    INodeConnectionOpts,
    NodeAgentHealthResponse,
    NodeSystemStatsResponse,
} from '@common/axios';
import { RawCacheService } from '@common/raw-cache';
import { CACHE_KEYS, CACHE_KEYS_TTL, EVENTS } from '@libs/contracts/constants';

import { NodeEvent } from '@integration-modules/notifications/interfaces';

import { NodeObservabilityRepository } from '@modules/node-observability';
import { UpdateNodeCommand } from '@modules/nodes/commands/update-node';

import { NodesQueuesService } from '@queue/_nodes';
import { QUEUES_NAMES } from '@queue/queue.enum';

import { NODES_JOB_NAMES } from '../constants/nodes-job-name.constant';
import { INodeHealthCheckPayload } from '../interfaces';
import {
    NODE_HEALTH_STATE_TTL_SECONDS,
    NODE_REPAIR_BACKOFF_TTL_SECONDS,
    NodeRepairBackoff,
    nextNodeRepairBackoff,
    shouldEscalateNodeHealthFailure,
    shouldRestoreNodeHealth,
} from '../node-health-policy.util';
import {
    MINIMUM_SING_BOX_AGENT_VERSION,
    resolveNodeRuntimeStatus,
    resolveNodeVersions,
} from '../node-runtime-status.util';

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
        private readonly nodeObservabilityRepository: NodeObservabilityRepository,
    ) {
        super();
    }
    async process(job: Job<INodeHealthCheckPayload>) {
        try {
            const { nodeUuid, isConnected, expectsCore, connectionOpts } = job.data;

            const healthResult = await this.axios.getNodeHealth(connectionOpts);
            if (!healthResult.isOk) {
                return await this.handleAgentFailure(
                    nodeUuid,
                    isConnected,
                    healthResult.message ?? 'Node agent is unavailable',
                );
            }
            if (!healthResult.response.isAlive) {
                return await this.handleAgentFailure(
                    nodeUuid,
                    isConnected,
                    'Node agent reported that it is not alive',
                );
            }

            if (
                !semver.valid(healthResult.response.nodeVersion) ||
                semver.lt(healthResult.response.nodeVersion, MINIMUM_SING_BOX_AGENT_VERSION)
            ) {
                return await this.handleDisconnectedNode(
                    nodeUuid,
                    isConnected,
                    `Unsupported Remnawave Node version ${healthResult.response.nodeVersion}; version >= ${MINIMUM_SING_BOX_AGENT_VERSION} is required`,
                );
            }

            await this.rawCacheService.del(CACHE_KEYS.NODE_AGENT_HEALTH_FAILURES(nodeUuid));

            const runtimeStatus = resolveNodeRuntimeStatus(healthResult.response);
            await Promise.all([
                this.cacheRuntimeStatus(nodeUuid, runtimeStatus),
                this.rawCacheService.set(
                    CACHE_KEYS.NODE_VERSIONS(nodeUuid),
                    resolveNodeVersions(healthResult.response),
                ),
                this.nodeObservabilityRepository.recordNodeHealth(nodeUuid, {
                    plugin: healthResult.response.plugin,
                    networkInterfaces: healthResult.response.networkInterfaces,
                }),
            ]);

            if (!expectsCore) {
                await this.clearCoreFailureState(nodeUuid);
                return await this.handleCorelessNode(healthResult.response, nodeUuid, isConnected);
            }

            if (!runtimeStatus.coreOnline) {
                return await this.handleCoreFailure(
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
                        await this.clearCoreFailureState(nodeUuid);
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

            return await this.handleCoreFailure(nodeUuid, isConnected, runtimeStatus, message);
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
            CACHE_KEYS.NODE_CORE_UPTIME(nodeUuid),
        ]);

        if (health.coreOnline) {
            this.logger.warn(
                `Node ${nodeUuid} has no active inbounds but a core is running; scheduling core stop.`,
            );
            await this.nodesQueuesService.startNode({ nodeUuid });
        }

        await this.markAgentConnected(nodeUuid, isConnected);
        return;
    }

    private async handleConnectedNode(
        connectionOpts: INodeConnectionOpts,
        nodeUuid: string,
        isConnected: boolean,
        stats: NodeSystemStatsResponse,
        runtimeStatus: ReturnType<typeof resolveNodeRuntimeStatus>,
    ) {
        const coreInfo = stats.coreInfo;
        if (coreInfo === null) {
            this.logger.error(`Node ${nodeUuid} – core info is missing`);

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
                key: CACHE_KEYS.NODE_CORE_UPTIME(nodeUuid),
                value: coreInfo.uptime,
                ttlSeconds: CACHE_KEYS_TTL.NODE_CORE_UPTIME,
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

        const restored = await this.markAgentConnected(nodeUuid, isConnected);
        if (restored) {
            await this.nodesQueuesService.startNode({ nodeUuid });
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
                CACHE_KEYS.NODE_CORE_UPTIME(nodeUuid),
            ]),
        ]);

        if (await this.shouldScheduleRepair(nodeUuid, 'core')) {
            await this.nodesQueuesService.startNode({ nodeUuid });
        }

        const logMessage = `Node agent ${nodeUuid} is online but its core is degraded: ${message}`;
        if (isConnected) this.logger.debug(logMessage);
        else this.logger.warn(logMessage);
    }

    private async markAgentConnected(
        nodeUuid: string,
        isConnected: boolean,
        message: string | null = null,
    ): Promise<boolean> {
        if (isConnected) {
            await this.rawCacheService.del(CACHE_KEYS.NODE_HEALTH_RECOVERY_SUCCESSES(nodeUuid));
            return false;
        }

        const successes = await this.rawCacheService.incrementWithTtl(
            CACHE_KEYS.NODE_HEALTH_RECOVERY_SUCCESSES(nodeUuid),
            NODE_HEALTH_STATE_TTL_SECONDS,
        );
        if (!shouldRestoreNodeHealth(successes)) {
            this.logger.debug(
                `Node ${nodeUuid} recovery check ${successes}; waiting for another successful check.`,
            );
            return false;
        }

        const nodeUpdatedResponse = await this.commandBus.execute(
            new UpdateNodeCommand({
                uuid: nodeUuid,
                isConnected: true,
                isConnecting: false,
                lastStatusMessage: message,
                lastStatusChange: new Date(),
            }),
        );

        if (!nodeUpdatedResponse.isOk) return false;

        await this.rawCacheService.delMany([
            CACHE_KEYS.NODE_HEALTH_RECOVERY_SUCCESSES(nodeUuid),
            CACHE_KEYS.NODE_AGENT_REPAIR_BACKOFF(nodeUuid),
            CACHE_KEYS.NODE_CORE_REPAIR_BACKOFF(nodeUuid),
        ]);

        this.eventEmitter.emit(
            EVENTS.NODE.CONNECTION_RESTORED,
            new NodeEvent(nodeUpdatedResponse.response, EVENTS.NODE.CONNECTION_RESTORED),
        );
        return true;
    }

    private async handleAgentFailure(
        nodeUuid: string,
        isConnected: boolean,
        message: string,
    ): Promise<void> {
        await this.rawCacheService.del(CACHE_KEYS.NODE_HEALTH_RECOVERY_SUCCESSES(nodeUuid));
        const failures = await this.rawCacheService.incrementWithTtl(
            CACHE_KEYS.NODE_AGENT_HEALTH_FAILURES(nodeUuid),
            NODE_HEALTH_STATE_TTL_SECONDS,
        );
        if (!shouldEscalateNodeHealthFailure(failures)) {
            this.logger.debug(
                `Node ${nodeUuid} agent health failure ${failures}; disconnect threshold not reached: ${message}`,
            );
            return;
        }
        return this.handleDisconnectedNode(nodeUuid, isConnected, message);
    }

    private async handleCoreFailure(
        nodeUuid: string,
        isConnected: boolean,
        runtimeStatus: ReturnType<typeof resolveNodeRuntimeStatus>,
        message: string,
    ): Promise<void> {
        const failures = await this.rawCacheService.incrementWithTtl(
            CACHE_KEYS.NODE_CORE_HEALTH_FAILURES(nodeUuid),
            NODE_HEALTH_STATE_TTL_SECONDS,
        );
        if (!shouldEscalateNodeHealthFailure(failures)) {
            this.logger.debug(
                `Node ${nodeUuid} core health failure ${failures}; repair threshold not reached: ${message}`,
            );
            return;
        }
        return this.handleDegradedCore(nodeUuid, isConnected, runtimeStatus, message);
    }

    private async clearCoreFailureState(nodeUuid: string): Promise<void> {
        await this.rawCacheService.delMany([
            CACHE_KEYS.NODE_CORE_HEALTH_FAILURES(nodeUuid),
            CACHE_KEYS.NODE_CORE_REPAIR_BACKOFF(nodeUuid),
        ]);
    }

    private async shouldScheduleRepair(
        nodeUuid: string,
        scope: 'agent' | 'core',
    ): Promise<boolean> {
        const key =
            scope === 'agent'
                ? CACHE_KEYS.NODE_AGENT_REPAIR_BACKOFF(nodeUuid)
                : CACHE_KEYS.NODE_CORE_REPAIR_BACKOFF(nodeUuid);
        const previous = await this.rawCacheService.get<NodeRepairBackoff>(key);
        const next = nextNodeRepairBackoff(previous, Date.now());
        if (!next) return false;
        await this.rawCacheService.set(key, next, NODE_REPAIR_BACKOFF_TTL_SECONDS);
        return true;
    }

    private async handleDisconnectedNode(
        nodeUuid: string,
        isConnected: boolean,
        message: string | undefined,
    ) {
        await this.rawCacheService.delMany([
            CACHE_KEYS.NODE_SYSTEM_INFO(nodeUuid),
            CACHE_KEYS.NODE_USERS_ONLINE(nodeUuid),
            CACHE_KEYS.NODE_CORE_UPTIME(nodeUuid),
            CACHE_KEYS.NODE_RUNTIME_STATUS(nodeUuid),
        ]);

        let nodeEntity = null;
        if (isConnected) {
            const updated = await this.commandBus.execute(
                new UpdateNodeCommand({
                    uuid: nodeUuid,
                    isConnected: false,
                    lastStatusChange: new Date(),
                    lastStatusMessage: message,
                }),
            );
            if (!updated.isOk) return;
            nodeEntity = updated.response;
        }

        if (await this.shouldScheduleRepair(nodeUuid, 'agent')) {
            await this.nodesQueuesService.startNode({ nodeUuid });
        }

        if (isConnected && nodeEntity) {
            this.eventEmitter.emit(
                EVENTS.NODE.CONNECTION_LOST,
                new NodeEvent(nodeEntity, EVENTS.NODE.CONNECTION_LOST),
            );
        }

        const logMessage = `Lost connection to Node ${nodeUuid}, message: ${message}`;
        if (isConnected) this.logger.warn(logMessage);
        else this.logger.debug(logMessage);

        return;
    }
}
