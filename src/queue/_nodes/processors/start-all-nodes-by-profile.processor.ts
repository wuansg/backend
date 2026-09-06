import { Job } from 'bullmq';
import pMap from 'p-map';
import semver from 'semver';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Scope } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';

import { AxiosService } from '@common/axios/axios.service';
import { RawCacheService } from '@common/raw-cache';
import { CACHE_KEYS, CACHE_KEYS_TTL } from '@libs/contracts/constants';

import { ConfigProfileInboundEntity } from '@modules/config-profiles/entities';
import { NodePluginEntity } from '@modules/node-plugins/entities';
import { GetAllPluginsQuery } from '@modules/node-plugins/queries/get-all-plugins';
import { NodesEntity } from '@modules/nodes';
import { UpdateNodeCommand } from '@modules/nodes/commands/update-node';
import { FindNodesByCriteriaQuery } from '@modules/nodes/queries/find-nodes-by-criteria';
import { GetPreparedConfigWithUsersQuery } from '@modules/users/queries/get-prepared-config-with-users/get-prepared-config-with-users.query';

import { NodesQueuesService } from '@queue/_nodes';

import { QUEUES_NAMES } from '../../queue.enum';
import { NODES_JOB_NAMES } from '../constants';
import { syncForwardingIfSupported } from '../forwarding-sync.util';

@Processor(
    {
        name: QUEUES_NAMES.NODES.START_ALL_BY_PROFILE,
        scope: Scope.REQUEST,
    },
    {
        concurrency: 5,
    },
)
export class StartAllNodesByProfileQueueProcessor extends WorkerHost {
    private readonly logger = new Logger(StartAllNodesByProfileQueueProcessor.name);
    private readonly CONCURRENCY: number;

    constructor(
        private readonly axios: AxiosService,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly queryBus: QueryBus,
        private readonly commandBus: CommandBus,
        private readonly rawCacheService: RawCacheService,
    ) {
        super();
        this.CONCURRENCY = 20;
    }

    async process(job: Job) {
        switch (job.name) {
            case NODES_JOB_NAMES.START_ALL_BY_PROFILE:
                return await this.handleStartAllNodesByProfile(job.data);
            default:
                this.logger.warn(`Job "${job.name}" is not handled.`);
                break;
        }
    }

    private async handleStartAllNodesByProfile(payload: {
        profileUuid: string;
        emitter: string;
        force?: boolean;
    }) {
        await this.nodesQueuesService.queues.startNode.pause();
        await this.nodesQueuesService.queues.startAllNodes.pause();

        try {
            const findNodesByCriteriaResult = await this.queryBus.execute(
                new FindNodesByCriteriaQuery({
                    isDisabled: false,
                    activeConfigProfileUuid: payload.profileUuid,
                }),
            );

            if (!findNodesByCriteriaResult.isOk) {
                return;
            }

            const { response: nodes } = findNodesByCriteriaResult;

            const activeInboundsOnNodes = new Map<string, ConfigProfileInboundEntity>();
            const activeNodeTags = new Map<string, string[]>();
            const nodesWithInbounds: NodesEntity[] = [];

            for (const node of nodes) {
                await this.rawCacheService.delMany([
                    CACHE_KEYS.NODE_SYSTEM_STATS(node.uuid),
                    CACHE_KEYS.NODE_USERS_ONLINE(node.uuid),
                    CACHE_KEYS.NODE_XRAY_UPTIME(node.uuid),
                ]);

                if (node.activeInbounds.length === 0) {
                    this.logger.log(
                        `Node ${node.uuid} has no active inbounds; scheduling core stop and forwarding-only synchronization.`,
                    );

                    await this.nodesQueuesService.startNode({
                        nodeUuid: node.uuid,
                        force: payload.force,
                    });

                    continue;
                }

                nodesWithInbounds.push(node);

                this.logger.log(
                    `Node ${node.uuid} has ${node.activeInbounds.length} active inbounds.`,
                );

                await this.commandBus.execute(
                    new UpdateNodeCommand({
                        uuid: node.uuid,
                        isConnecting: true,
                    }),
                );

                for (const inbound of node.activeInbounds) {
                    if (activeInboundsOnNodes.has(inbound.tag)) {
                        continue;
                    } else {
                        activeInboundsOnNodes.set(inbound.tag, inbound);
                    }
                }

                activeNodeTags.set(
                    node.uuid,
                    node.activeInbounds.map((inbound) => inbound.tag),
                );
            }

            if (activeInboundsOnNodes.size === 0) {
                return;
            }

            const pluginsResult = await this.queryBus.execute(new GetAllPluginsQuery(true));

            if (!pluginsResult.isOk) {
                this.logger.error(`Failed to get all plugins: ${pluginsResult.message}`);
                return;
            }

            const pluginsMap = new Map<string, NodePluginEntity>(
                pluginsResult.response.map((plugin) => [plugin.uuid, plugin]),
            );

            const startTime = Date.now();

            const config = await this.queryBus.execute(
                new GetPreparedConfigWithUsersQuery(
                    payload.profileUuid,
                    Array.from(activeInboundsOnNodes.values()),
                ),
            );

            this.logger.log(`Generated config for nodes by Profile in ${Date.now() - startTime}ms`);

            const mapper = async (node: NodesEntity) => {
                if (!config.isOk) {
                    throw new Error('Failed to get config');
                }

                const activeNodeInboundsTags = new Set(activeNodeTags.get(node.uuid));

                if (!activeNodeInboundsTags) {
                    throw new Error('Failed to get active node inbounds tags');
                }

                let pluginsSupported = true;
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

                if (
                    healthResponse.response.nodeVersion === null ||
                    healthResponse.response.nodeVersion === undefined
                ) {
                    await this.commandBus.execute(
                        new UpdateNodeCommand({
                            uuid: node.uuid,
                            lastStatusMessage:
                                'Unknown node version. Please upgrade Remnawave Node to the latest version.',
                            lastStatusChange: new Date(),
                            isConnected: false,
                            isConnecting: false,
                        }),
                    );

                    this.logger.error(
                        `Node ${node.uuid} – unknown node version. Please upgrade Remnawave Node to the latest version.`,
                    );
                    return;
                } else if (semver.lt(healthResponse.response.nodeVersion, '2.7.0')) {
                    pluginsSupported = false;

                    this.logger.warn(
                        `Node ${node.uuid} running on outdated version of Remnawave Node. Please upgrade to the latest version. Some features may not work properly.`,
                    );
                }

                if (pluginsSupported) {
                    let plugin: {
                        uuid: string;
                        config: Record<string, unknown>;
                        name: string;
                    } | null = null;

                    if (node.activePluginUuid) {
                        const nodePlugin = pluginsMap.get(node.activePluginUuid);

                        if (!nodePlugin) {
                            this.logger.error(`Node plugin not found: ${node.activePluginUuid}`);
                            return;
                        }

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
                }

                const filteredInboundsHashes = config.response.hashesPayload.inbounds.filter(
                    (inbound) => activeNodeInboundsTags.has(inbound.tag),
                );
                const preparedConfig = config.response.config as Record<string, unknown>;

                const internals = {
                    hashes: {
                        emptyConfig: config.response.hashesPayload.emptyConfig,
                        inbounds: filteredInboundsHashes,
                    },
                    forceRestart: payload.force ?? false,
                };

                const startCoreResponse = await this.axios.startCore(
                    {
                        coreType: 'SING_BOX' as const,
                        singBoxConfig: {
                            ...preparedConfig,
                            inbounds: this.filterSingBoxInbounds(
                                preparedConfig.inbounds,
                                activeNodeInboundsTags,
                            ),
                        } as Record<string, unknown>,
                        internals,
                    },
                    {
                        address: node.address,
                        port: node.port,
                        proxyUrl: node.proxyUrl,
                    },
                    semver.lt(healthResponse.response.nodeVersion, '3.7.0'),
                );

                switch (startCoreResponse.isOk) {
                    case false:
                        await this.commandBus.execute(
                            new UpdateNodeCommand({
                                uuid: node.uuid,
                                lastStatusMessage: startCoreResponse.message ?? null,
                                lastStatusChange: new Date(),
                                isConnected: false,
                                isConnecting: false,
                            }),
                        );

                        return;
                    case true:
                        const nodeResponse = startCoreResponse.response;

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

                        await this.rawCacheService.setMany([
                            {
                                key: CACHE_KEYS.NODE_SYSTEM_STATS(node.uuid),
                                value: nodeResponse.system.stats,
                                ttlSeconds: CACHE_KEYS_TTL.NODE_SYSTEM_STATS,
                            },
                            {
                                key: CACHE_KEYS.NODE_SYSTEM_INFO(node.uuid),
                                value: nodeResponse.system.info,
                            },
                            {
                                key: CACHE_KEYS.NODE_VERSIONS(node.uuid),
                                value:
                                    nodeResponse.nodeInformation.version && nodeResponse.version
                                        ? {
                                              xray: nodeResponse.coreVersions?.xray ?? '',
                                              singBox:
                                                  nodeResponse.coreVersions?.singBox ??
                                                  nodeResponse.version,
                                              node: nodeResponse.nodeInformation.version,
                                              core:
                                                  nodeResponse.runningCore ??
                                                  config.response.coreType,
                                          }
                                        : null,
                            },
                            {
                                key: CACHE_KEYS.NODE_CONFIG_APPLY(node.uuid),
                                value: nodeResponse.configApply ?? null,
                            },
                        ]);

                        await this.commandBus.execute(
                            new UpdateNodeCommand({
                                uuid: node.uuid,
                                isConnected: nodeResponse.isStarted,
                                lastStatusMessage: nodeResponse.error ?? null,
                                lastStatusChange: new Date(),
                                isConnecting: false,
                            }),
                        );

                        return;
                }
            };

            await pMap(nodesWithInbounds, mapper, { concurrency: this.CONCURRENCY });

            this.logger.log(
                `Started all nodes with profile ${payload.profileUuid} in ${Date.now() - startTime}ms`,
            );
        } catch (error) {
            this.logger.error(
                `Error handling "${NODES_JOB_NAMES.START_ALL_BY_PROFILE}" job: ${error}`,
            );
        } finally {
            await this.nodesQueuesService.queues.startNode.resume();
            await this.nodesQueuesService.queues.startAllNodes.resume();
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
