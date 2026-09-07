import { Job } from 'bullmq';
import semver from 'semver';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AxiosService } from '@common/axios/axios.service';
import { RawCacheService } from '@common/raw-cache';
import { formatExecutionTime, getTime } from '@common/utils/get-elapsed-time';
import { CACHE_KEYS, CACHE_KEYS_TTL, EVENTS } from '@libs/contracts/constants';

import { NodeEvent } from '@integration-modules/notifications/interfaces';

import { GetPluginByUuidQuery } from '@modules/node-plugins/queries/get-plugin-by-uuid';
import { UpdateNodeCommand } from '@modules/nodes/commands/update-node';
import { GetNodeByUuidQuery } from '@modules/nodes/queries/get-node-by-uuid';
import { GetPreparedConfigWithUsersQuery } from '@modules/users/queries/get-prepared-config-with-users';

import { QUEUES_NAMES } from '@queue/queue.enum';

import { NODES_JOB_NAMES } from '../constants/nodes-job-name.constant';
import { syncForwardingIfSupported } from '../forwarding-sync.util';
import {
    MINIMUM_SING_BOX_AGENT_VERSION,
    resolveNodeRuntimeStatus,
} from '../node-runtime-status.util';
import { NodesQueuesService } from '../nodes-queues.service';

@Processor(QUEUES_NAMES.NODES.START, {
    concurrency: 40,
})
export class StartNodeProcessor extends WorkerHost {
    private readonly logger = new Logger(StartNodeProcessor.name);

    constructor(
        private readonly axios: AxiosService,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly queryBus: QueryBus,
        private readonly eventEmitter: EventEmitter2,
        private readonly commandBus: CommandBus,
        private readonly rawCacheService: RawCacheService,
    ) {
        super();
    }

    async process(job: Job<{ nodeUuid: string; force?: boolean }>) {
        try {
            const { nodeUuid, force } = job.data;

            const nodeCheckup = await this.queryBus.execute(new GetNodeByUuidQuery(nodeUuid));

            if (!nodeCheckup.isOk) {
                this.logger.error(`Node ${nodeUuid} not found`);
                return;
            }

            const { response: node } = nodeCheckup;

            if (node.isConnecting) {
                return;
            }

            await this.rawCacheService.delMany([
                CACHE_KEYS.NODE_SYSTEM_STATS(nodeUuid),
                CACHE_KEYS.NODE_USERS_ONLINE(nodeUuid),
                CACHE_KEYS.NODE_CORE_UPTIME(nodeUuid),
            ]);

            await this.commandBus.execute(
                new UpdateNodeCommand({
                    uuid: node.uuid,
                    isConnecting: true,
                }),
            );

            const healthResponse = await this.axios.getNodeHealth({
                address: node.address,
                port: node.port,
                proxyUrl: node.proxyUrl,
            });

            if (!healthResponse.isOk) {
                await this.commandBus.execute(
                    new UpdateNodeCommand({
                        uuid: node.uuid,
                        lastStatusMessage: healthResponse.message ?? null,
                        lastStatusChange: new Date(),
                        isConnected: false,
                        isConnecting: false,
                    }),
                );

                this.logger.error(
                    `Pre-check failed. Node: ${node.uuid} – ${node.address}:${node.port}, error: ${healthResponse.message}`,
                );

                return;
            }

            if (semver.lt(healthResponse.response.nodeVersion, MINIMUM_SING_BOX_AGENT_VERSION)) {
                await this.commandBus.execute(
                    new UpdateNodeCommand({
                        uuid: node.uuid,
                        lastStatusMessage: `Outdated version ${healthResponse.response.nodeVersion} of Remnawave Node. Please upgrade to the latest version (>= ${MINIMUM_SING_BOX_AGENT_VERSION}).`,
                        lastStatusChange: new Date(),
                        isConnected: false,
                        isConnecting: false,
                    }),
                );

                this.logger.error(
                    `Outdated version ${healthResponse.response.nodeVersion} of Remnawave Node. Please upgrade to the latest version (>= ${MINIMUM_SING_BOX_AGENT_VERSION}).`,
                );

                return;
            }

            let plugin: {
                uuid: string;
                config: Record<string, unknown>;
                name: string;
            } | null = null;

            if (node.activePluginUuid) {
                const getNodePluginResult = await this.queryBus.execute(
                    new GetPluginByUuidQuery(node.activePluginUuid),
                );

                if (!getNodePluginResult.isOk) {
                    this.logger.error(`Failed to get node plugin: ${getNodePluginResult.message}`);
                    return;
                }
                const { response: nodePlugin } = getNodePluginResult;
                plugin = {
                    uuid: nodePlugin.uuid,
                    config: nodePlugin.pluginConfig as Record<string, unknown>,
                    name: nodePlugin.name,
                };
            }

            const syncNodePluginsResponse = await this.axios.syncNodePlugins(
                {
                    plugin,
                },
                {
                    address: node.address,
                    port: node.port,
                    proxyUrl: node.proxyUrl,
                },
            );

            if (!syncNodePluginsResponse.isOk) {
                await this.commandBus.execute(
                    new UpdateNodeCommand({
                        uuid: node.uuid,
                        isConnecting: false,
                        isConnected: false,
                        lastStatusMessage: `Failed to sync node plugins: ${syncNodePluginsResponse.message}`,
                        lastStatusChange: new Date(),
                    }),
                );

                this.logger.error(
                    `Failed to sync node plugins: ${syncNodePluginsResponse.message}`,
                );
                return;
            }

            if (node.activeInbounds.length === 0 || !node.activeConfigProfileUuid) {
                const stopCoreResponse = await this.axios.stopCore({
                    address: node.address,
                    port: node.port,
                    proxyUrl: node.proxyUrl,
                });

                if (!stopCoreResponse.isOk || !stopCoreResponse.response.isStopped) {
                    const stopError = stopCoreResponse.isOk
                        ? 'Node agent reported that the core could not be stopped'
                        : (stopCoreResponse.message ?? 'Unknown error');
                    await this.commandBus.execute(
                        new UpdateNodeCommand({
                            uuid: node.uuid,
                            isConnecting: false,
                            isConnected: false,
                            lastStatusMessage: `Failed to stop node core: ${stopError}`,
                            lastStatusChange: new Date(),
                        }),
                    );
                    return;
                }

                const forwardingError = await syncForwardingIfSupported(
                    this.axios,
                    node,
                    healthResponse.response,
                );
                if (forwardingError) {
                    this.logger.warn(
                        `Forwarding sync failed for coreless node ${node.uuid}; keeping the last applied rules: ${forwardingError}`,
                    );
                }

                await this.rawCacheService.set(CACHE_KEYS.NODE_VERSIONS(node.uuid), {
                    singBox: healthResponse.response.coreVersions?.singBox ?? null,
                    node: healthResponse.response.nodeVersion,
                    core: null,
                });
                const refreshedHealth = await this.axios.getNodeHealth({
                    address: node.address,
                    port: node.port,
                    proxyUrl: node.proxyUrl,
                });
                if (refreshedHealth.isOk) {
                    await this.rawCacheService.set(
                        CACHE_KEYS.NODE_RUNTIME_STATUS(node.uuid),
                        resolveNodeRuntimeStatus(refreshedHealth.response),
                        CACHE_KEYS_TTL.NODE_RUNTIME_STATUS,
                    );
                }

                const updateNodeResult = await this.commandBus.execute(
                    new UpdateNodeCommand({
                        uuid: node.uuid,
                        isConnected: true,
                        isConnecting: false,
                        lastStatusMessage: null,
                        lastStatusChange: new Date(),
                    }),
                );

                if (!updateNodeResult.isOk) {
                    this.logger.error(`Failed to update coreless node ${node.uuid}`);
                    return;
                }

                this.logger.log(
                    `Node ${node.uuid} has no active inbounds; core stopped and forwarding synchronized.`,
                );

                if (!node.isConnected) {
                    this.eventEmitter.emit(
                        EVENTS.NODE.CONNECTION_RESTORED,
                        new NodeEvent(updateNodeResult.response, EVENTS.NODE.CONNECTION_RESTORED),
                    );
                }

                return;
            }

            const startTime = getTime();
            const config = await this.queryBus.execute(
                new GetPreparedConfigWithUsersQuery(
                    node.activeConfigProfileUuid,
                    node.activeInbounds,
                ),
            );

            this.logger.log(`Generated config for node in ${formatExecutionTime(startTime)}`);

            if (!config.isOk) {
                throw new Error('Failed to get config for node');
            }

            const reqStartTime = getTime();
            const activeNodeInboundsTags = new Set(
                node.activeInbounds.map((inbound) => inbound.tag),
            );
            const preparedConfig = config.response.config as Record<string, unknown>;

            const startNodeResult = await this.axios.startCore(
                {
                    coreType: 'SING_BOX' as const,
                    singBoxConfig: {
                        ...preparedConfig,
                        inbounds: this.filterSingBoxInbounds(
                            preparedConfig.inbounds,
                            activeNodeInboundsTags,
                        ),
                    },
                    internals: {
                        hashes: config.response.hashesPayload,
                        forceRestart: force ?? false,
                    },
                },
                {
                    address: node.address,
                    port: node.port,
                    proxyUrl: node.proxyUrl,
                },
            );

            this.logger.log(`Started node in ${formatExecutionTime(reqStartTime)}`);

            if (!startNodeResult.isOk) {
                await this.commandBus.execute(
                    new UpdateNodeCommand({
                        uuid: node.uuid,
                        lastStatusMessage: startNodeResult.message ?? null,
                        lastStatusChange: new Date(),
                        isConnected: false,
                        isConnecting: false,
                    }),
                );

                return;
            }

            const nodeResponse = startNodeResult.response;

            const forwardingError = await syncForwardingIfSupported(
                this.axios,
                node,
                healthResponse.response,
            );
            if (forwardingError) {
                this.logger.warn(
                    `Forwarding sync failed for node ${node.uuid}; keeping the last applied rules: ${forwardingError}`,
                );
            }

            const refreshedHealth = await this.axios.getNodeHealth({
                address: node.address,
                port: node.port,
                proxyUrl: node.proxyUrl,
            });
            if (refreshedHealth.isOk) {
                await this.rawCacheService.set(
                    CACHE_KEYS.NODE_RUNTIME_STATUS(node.uuid),
                    resolveNodeRuntimeStatus(refreshedHealth.response),
                    CACHE_KEYS_TTL.NODE_RUNTIME_STATUS,
                );
            }

            await this.rawCacheService.setMany([
                {
                    key: CACHE_KEYS.NODE_SYSTEM_INFO(node.uuid),
                    value: nodeResponse.system.info,
                },
                {
                    key: CACHE_KEYS.NODE_VERSIONS(node.uuid),
                    value:
                        nodeResponse.nodeInformation.version && nodeResponse.version
                            ? {
                                  singBox:
                                      nodeResponse.coreVersions?.singBox ?? nodeResponse.version,
                                  node: nodeResponse.nodeInformation.version,
                                  core: nodeResponse.runningCore ?? config.response.coreType,
                              }
                            : null,
                },
                {
                    key: CACHE_KEYS.NODE_SYSTEM_STATS(node.uuid),
                    value: nodeResponse.system.stats,
                    ttlSeconds: CACHE_KEYS_TTL.NODE_SYSTEM_STATS,
                },
                {
                    key: CACHE_KEYS.NODE_CONFIG_APPLY(node.uuid),
                    value: nodeResponse.configApply ?? null,
                },
            ]);

            const updateNodeResult = await this.commandBus.execute(
                new UpdateNodeCommand({
                    uuid: node.uuid,
                    isConnected: nodeResponse.isStarted,
                    lastStatusMessage: nodeResponse.error ?? null,
                    lastStatusChange: new Date(),
                    isConnecting: false,
                }),
            );

            if (!updateNodeResult.isOk) {
                this.logger.error(`Failed to update node ${node.uuid}`);
                return;
            }

            if (!node.isConnected && nodeResponse.isStarted) {
                this.eventEmitter.emit(
                    EVENTS.NODE.CONNECTION_RESTORED,
                    new NodeEvent(updateNodeResult.response, EVENTS.NODE.CONNECTION_RESTORED),
                );
            }

            return;
        } catch (error) {
            this.logger.error(`Error handling "${NODES_JOB_NAMES.START_NODE}" job: ${error}`);
        }
    }

    private filterSingBoxInbounds(
        inbounds: unknown,
        activeNodeInboundsTags: Set<string>,
    ): Array<Record<string, unknown>> {
        if (!Array.isArray(inbounds)) {
            return [];
        }

        return inbounds.filter((inbound) => {
            if (!this.isRecord(inbound)) return false;
            const tag = inbound.tag;
            const type = inbound.type;
            return (
                (typeof tag === 'string' && activeNodeInboundsTags.has(tag)) ||
                (typeof type === 'string' && this.isUnsecureInbound(type))
            );
        }) as Array<Record<string, unknown>>;
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null;
    }

    private isUnsecureInbound(protocol: string): boolean {
        return [
            'direct',
            'http',
            'mixed',
            'socks',
            'tproxy',
            'redirect',
            'tun',
            'wireguard',
        ].includes(protocol);
    }
}
