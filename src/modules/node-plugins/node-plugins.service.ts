import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { nanoid } from 'nanoid';

import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { AxiosService } from '@common/axios';
import { fail, ok, TResult } from '@common/types';
import { stableJsonHash } from '@common/utils/stable-json-hash.util';
import { GetTorrentBlockerReportsCommand } from '@libs/contracts/commands';
import { ERRORS } from '@libs/contracts/constants';
import { NodePluginEditorSchema } from '@libs/node-plugins/models';

import { NodeObservabilityRepository } from '@modules/node-observability';
import { NodesEntity } from '@modules/nodes/entities/nodes.entity';
import { FindNodesByCriteriaQuery } from '@modules/nodes/queries/find-nodes-by-criteria';
import { GetNodeByUuidQuery } from '@modules/nodes/queries/get-node-by-uuid';
import { GetNodesByPluginUuidQuery } from '@modules/nodes/queries/get-nodes-by-plugin-uuid';

import { NodesQueuesService } from '@queue/_nodes';

import { EXAMPLE_NODE_PLUGIN_CONFIG } from './constants';
import { PluginExecutorBodyDto } from './dtos';
import { ExtendedTorrentBlockerReportEntity } from './entities';
import { NodePluginEntity } from './entities/node-plugin.entity';
import {
    BaseNodePluginResponseModel,
    GetNodePluginsResponseModel,
    TorrentBlockerReportsStatsResponseModel,
} from './models';
import {} from './models/base-node-plugin.response.model';
import { NodePluginRepository } from './repositories/node-plugins.repository';
import { SharedListsRepository } from './repositories/shared-lists.repository';
import { TorrentBlockerReportsRepository } from './repositories/torrent-blocker-report.repository';
import {
    collectSharedListReferences,
    injectSharedLists,
    validateSharedListReferences,
} from './utils';

@Injectable()
export class NodePluginService {
    private readonly logger = new Logger(NodePluginService.name);

    constructor(
        private readonly nodePluginRepository: NodePluginRepository,
        private readonly sharedListsRepository: SharedListsRepository,
        private readonly nodeQueuesService: NodesQueuesService,
        private readonly torrentBlockerReportsRepository: TorrentBlockerReportsRepository,
        private readonly queryBus: QueryBus,
        private readonly axios: AxiosService,
        private readonly nodeObservabilityRepository: NodeObservabilityRepository,
    ) {}

    public async getAllConfigs(): Promise<TResult<GetNodePluginsResponseModel>> {
        try {
            const nodePlugins = await this.nodePluginRepository.getAllNodePlugins(false);

            return ok(new GetNodePluginsResponseModel(nodePlugins, nodePlugins.length));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_ALL_NODE_PLUGINS_ERROR);
        }
    }

    public async getConfigByUuid(uuid: string): Promise<TResult<BaseNodePluginResponseModel>> {
        try {
            const nodePlugin = await this.nodePluginRepository.findByUUID(uuid);

            if (!nodePlugin) {
                return fail(ERRORS.NODE_PLUGIN_NOT_FOUND);
            }

            return ok(new BaseNodePluginResponseModel(nodePlugin));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_NODE_PLUGIN_BY_UUID_ERROR);
        }
    }

    public async updateConfig(
        uuid: string,
        name: string | undefined,
        inputConfig: object | undefined,
    ): Promise<TResult<BaseNodePluginResponseModel>> {
        try {
            const nodePlugin = await this.nodePluginRepository.findByUUID(uuid);

            if (!nodePlugin) {
                return fail(ERRORS.NODE_PLUGIN_NOT_FOUND);
            }

            if (inputConfig) {
                const validatedConfig = await NodePluginEditorSchema.safeParseAsync(inputConfig);

                if (!validatedConfig.success) {
                    const errorMessage = validatedConfig.error.issues
                        .map(
                            (err) =>
                                `${err.path.length ? `${err.path.join('.')}: ` : ''}${err.message}`,
                        )
                        .join(', ');
                    this.logger.error(errorMessage);
                    return fail(ERRORS.INVALID_NODE_PLUGIN_CONFIG.withMessage(errorMessage));
                }

                const sharedLists = await this.sharedListsRepository.getAllSharedLists();
                const referenceErrors = validateSharedListReferences(
                    validatedConfig.data,
                    sharedLists,
                );
                if (referenceErrors.length > 0) {
                    return fail(
                        ERRORS.INVALID_NODE_PLUGIN_CONFIG.withMessage(
                            `Invalid shared list reference(s): ${referenceErrors.join(', ')}`,
                        ),
                    );
                }

                inputConfig = validatedConfig.data;
            }

            const updatedConfig = await this.nodePluginRepository.update({
                uuid: nodePlugin.uuid,
                name: name ?? undefined,
                pluginConfig: inputConfig ?? undefined,
            });

            await this.syncNodePlugins(nodePlugin.uuid);

            return ok(new BaseNodePluginResponseModel(updatedConfig));
        } catch (error) {
            this.logger.error(error);

            if (
                error instanceof PrismaClientKnownRequestError &&
                error.code === 'P2002' &&
                error.meta?.modelName === 'NodePlugin' &&
                Array.isArray(error.meta.target)
            ) {
                const fields = error.meta.target as string[];
                if (fields.includes('name')) {
                    return fail(ERRORS.NODE_PLUGIN_NAME_ALREADY_EXISTS);
                }
            }

            return fail(ERRORS.UPDATE_NODE_PLUGIN_ERROR);
        }
    }

    public async deleteConfig(uuid: string): Promise<TResult<boolean>> {
        try {
            const nodePlugin = await this.nodePluginRepository.findByUUID(uuid);

            if (!nodePlugin) {
                return fail(ERRORS.NODE_PLUGIN_NOT_FOUND);
            }

            const nodeUuids = await this.queryBus.execute(
                new GetNodesByPluginUuidQuery(nodePlugin.uuid),
            );

            await this.nodePluginRepository.deleteByUUID(uuid);

            if (nodeUuids.isOk && nodeUuids.response.length > 0) {
                await this.nodeQueuesService.syncNodePluginsBulk(
                    nodeUuids.response.map((nodeUuid) => ({ nodeUuid })),
                );
            }

            return ok(true);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async createConfig(name: string): Promise<TResult<BaseNodePluginResponseModel>> {
        try {
            const nodePluginEntity = new NodePluginEntity({
                name,
                pluginConfig: EXAMPLE_NODE_PLUGIN_CONFIG,
            });

            const nodePlugin = await this.nodePluginRepository.create(nodePluginEntity);

            return ok(new BaseNodePluginResponseModel(nodePlugin));
        } catch (error) {
            this.logger.error(error);

            if (
                error instanceof PrismaClientKnownRequestError &&
                error.code === 'P2002' &&
                error.meta?.modelName === 'NodePlugin' &&
                Array.isArray(error.meta.target)
            ) {
                const fields = error.meta.target as string[];
                if (fields.includes('name')) {
                    return fail(ERRORS.NODE_PLUGIN_NAME_ALREADY_EXISTS);
                }
            }

            return fail(ERRORS.CREATE_NODE_PLUGIN_ERROR);
        }
    }

    public async reorderNodePlugins(
        dto: {
            uuid: string;
            viewPosition: number;
        }[],
    ): Promise<TResult<GetNodePluginsResponseModel>> {
        try {
            await this.nodePluginRepository.reorderMany(dto);

            return await this.getAllConfigs();
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GENERIC_REORDER_ERROR);
        }
    }

    public async cloneNodePlugin(
        cloneFromUuid: string,
    ): Promise<TResult<BaseNodePluginResponseModel>> {
        try {
            const nodePlugin = await this.nodePluginRepository.findByUUID(cloneFromUuid);

            if (!nodePlugin) {
                return fail(ERRORS.NODE_PLUGIN_NOT_FOUND);
            }

            const newNodePlugin = await this.nodePluginRepository.create(
                new NodePluginEntity({
                    name: `Clone ${nanoid(5)}`,
                    pluginConfig: nodePlugin.pluginConfig,
                }),
            );

            return ok(new BaseNodePluginResponseModel(newNodePlugin));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.CREATE_NODE_PLUGIN_ERROR);
        }
    }

    public async syncNodePluginByUuid(pluginUuid: string): Promise<TResult<boolean>> {
        const nodePlugin = await this.nodePluginRepository.findByUUID(pluginUuid);
        if (!nodePlugin) return fail(ERRORS.NODE_PLUGIN_NOT_FOUND);
        await this.syncNodePlugins(pluginUuid);
        return ok(true);
    }

    public async previewConfig(input: {
        uuid?: string;
        nodeUuid?: string;
        pluginConfig: Record<string, unknown>;
    }): Promise<TResult<Record<string, unknown>>> {
        try {
            const validated = await NodePluginEditorSchema.safeParseAsync(input.pluginConfig);
            if (!validated.success) {
                const message = validated.error.issues
                    .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
                    .join(', ');
                return fail(ERRORS.INVALID_NODE_PLUGIN_CONFIG.withMessage(message));
            }

            const sharedLists = await this.sharedListsRepository.getAllSharedLists();
            const referenceErrors = validateSharedListReferences(validated.data, sharedLists);
            if (referenceErrors.length > 0) {
                return fail(
                    ERRORS.INVALID_NODE_PLUGIN_CONFIG.withMessage(
                        `Invalid shared list reference(s): ${referenceErrors.join(', ')}`,
                    ),
                );
            }

            const generatedConfig = injectSharedLists(validated.data, sharedLists);
            const references = collectSharedListReferences(validated.data);
            const referencedLists = sharedLists
                .filter((list) => references.has(list.name))
                .map((list) => {
                    const config = list.config as Record<string, unknown>;
                    return {
                        name: list.name,
                        type: config.type,
                        itemsCount: Array.isArray(config.items) ? config.items.length : 0,
                    };
                });
            const desiredHash = stableJsonHash(generatedConfig);
            const current = input.uuid
                ? await this.nodePluginRepository.findByUUID(input.uuid)
                : null;
            const currentConfig = current?.pluginConfig ?? {};
            const affectedNodeUuids = input.uuid
                ? await this.queryBus.execute(new GetNodesByPluginUuidQuery(input.uuid))
                : null;
            const affectedNodes = await Promise.all(
                (affectedNodeUuids?.isOk ? affectedNodeUuids.response : []).map(async (uuid) => {
                    const node = await this.queryBus.execute(new GetNodeByUuidQuery(uuid));
                    return node.isOk
                        ? {
                              uuid,
                              name: node.response.name,
                              connected: node.response.isConnected,
                          }
                        : { uuid, name: uuid, connected: false };
                }),
            );

            let compile: Record<string, unknown> | null = null;
            const compileNodeUuid =
                input.nodeUuid ?? affectedNodes.find((node) => node.connected)?.uuid;
            if (compileNodeUuid) {
                const node = await this.queryBus.execute(new GetNodeByUuidQuery(compileNodeUuid));
                if (!node.isOk) return fail(ERRORS.NODE_NOT_FOUND);
                const result = await this.axios.compileNodePlugin(
                    {
                        plugin: {
                            uuid: input.uuid ?? '00000000-0000-0000-0000-000000000000',
                            name: current?.name ?? 'Unsaved preview',
                            config: generatedConfig,
                        },
                    },
                    {
                        address: node.response.address,
                        port: node.response.port,
                        proxyUrl: node.response.proxyUrl,
                    },
                );
                compile = result.isOk
                    ? { supported: true, nodeUuid: compileNodeUuid, ...result.response }
                    : { supported: false, nodeUuid: compileNodeUuid, error: result.message };
            }

            const deployments = input.uuid
                ? await this.nodeObservabilityRepository.getPluginStatus(input.uuid)
                : [];

            return ok({
                valid: true,
                desiredHash,
                currentSavedHash: current
                    ? stableJsonHash(injectSharedLists(currentConfig, sharedLists))
                    : null,
                diff: diffJson(currentConfig, validated.data),
                referencedLists,
                affectedNodes,
                domainsToResolve: collectEgressDomains(validated.data, sharedLists),
                deployments: deployments.map(serializeDeployment),
                compile,
            });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INVALID_NODE_PLUGIN_CONFIG.withMessage(String(error)));
        }
    }

    public async getPluginStatus(uuid: string): Promise<TResult<Record<string, unknown>>> {
        try {
            const plugin = await this.nodePluginRepository.findByUUID(uuid);
            if (!plugin) return fail(ERRORS.NODE_PLUGIN_NOT_FOUND);
            const deployments = await this.nodeObservabilityRepository.getPluginStatus(uuid);
            const referencedLists = [
                ...collectSharedListReferences(plugin.pluginConfig as Record<string, unknown>),
            ];
            return ok({
                deployments: deployments.map(serializeDeployment),
                referencedLists,
            });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async getSharedListReferences(name: string): Promise<TResult<Record<string, unknown>>> {
        try {
            const list = await this.sharedListsRepository.findByName(name);
            if (!list) return fail(ERRORS.SHARED_LIST_NOT_FOUND);
            const pluginUuids = await this.nodePluginRepository.getUuidsBySharedListName(name);
            const plugins = await Promise.all(
                pluginUuids.map(async (uuid) => {
                    const [plugin, nodes] = await Promise.all([
                        this.nodePluginRepository.findByUUID(uuid),
                        this.queryBus.execute(new GetNodesByPluginUuidQuery(uuid)),
                    ]);
                    return {
                        uuid,
                        name: plugin?.name ?? uuid,
                        nodes: nodes.isOk ? nodes.response : [],
                    };
                }),
            );
            return ok({
                list: {
                    name: list.name,
                    type: (list.config as Record<string, unknown>).type,
                },
                plugins,
                affectedNodeCount: new Set(plugins.flatMap((plugin) => plugin.nodes)).size,
            });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    private async syncNodePlugins(pluginUuid: string): Promise<void> {
        const nodeUuids = await this.queryBus.execute(new GetNodesByPluginUuidQuery(pluginUuid));

        if (nodeUuids.isOk && nodeUuids.response.length > 0) {
            await this.nodeQueuesService.syncNodePluginsBulk(
                nodeUuids.response.map((nodeUuid) => ({ nodeUuid })),
            );
        }

        return;
    }

    public async executePluginCommand(dto: PluginExecutorBodyDto): Promise<TResult<boolean>> {
        try {
            const findResult = await this.queryBus.execute(
                new FindNodesByCriteriaQuery({
                    isDisabled: false,
                    isConnected: true,
                    isConnecting: false,
                }),
            );

            if (!findResult.isOk || findResult.response.length === 0) {
                return fail(ERRORS.CONNECTED_NODES_NOT_FOUND);
            }

            let nodes: NodesEntity[] = [];

            if (dto.targetNodes.target === 'allNodes') {
                nodes = findResult.response;
            } else {
                const { nodeUuids } = dto.targetNodes;
                nodes = findResult.response.filter((node) => nodeUuids.includes(node.uuid));
            }

            if (nodes.length === 0) {
                return fail(ERRORS.CONNECTED_NODES_NOT_FOUND);
            }

            switch (dto.command.command) {
                case 'blockIps':
                    for (const node of nodes) {
                        await this.nodeQueuesService.blockIps({
                            data: {
                                ips: dto.command.ips,
                            },
                            node: {
                                address: node.address,
                                port: node.port,
                                proxyUrl: node.proxyUrl,
                            },
                        });
                    }
                    break;
                case 'unblockIps':
                    for (const node of nodes) {
                        await this.nodeQueuesService.unblockIps({
                            data: {
                                ips: dto.command.ips,
                            },
                            node: {
                                address: node.address,
                                port: node.port,
                                proxyUrl: node.proxyUrl,
                            },
                        });
                    }
                    break;
                case 'recreateTables':
                    for (const node of nodes) {
                        await this.nodeQueuesService.recreateTables({
                            node: {
                                address: node.address,
                                port: node.port,
                                proxyUrl: node.proxyUrl,
                            },
                        });
                    }
                    break;
                default:
                    this.logger.error(`Invalid command: ${dto.command}`);
                    return fail(ERRORS.INTERNAL_SERVER_ERROR);
            }

            return ok(true);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async getTorrentBlockerReports(
        dto: GetTorrentBlockerReportsCommand.RequestQuery,
    ): Promise<
        TResult<{
            total: number;
            records: ExtendedTorrentBlockerReportEntity[];
        }>
    > {
        try {
            const [records, total] = await this.torrentBlockerReportsRepository.getAllReports(dto);

            return ok({
                records,
                total,
            });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_TORRENT_BLOCKER_REPORTS_ERROR);
        }
    }

    public async truncateTorrentBlockerReports(): Promise<TResult<boolean>> {
        try {
            await this.torrentBlockerReportsRepository.truncateReports();
            return ok(true);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async getTorrentBlockerReportsStats(): Promise<
        TResult<TorrentBlockerReportsStatsResponseModel>
    > {
        try {
            const stats = await this.torrentBlockerReportsRepository.getStats();
            const topUsers = await this.torrentBlockerReportsRepository.getTopTorrentBlockerUsers();
            const topNodes = await this.torrentBlockerReportsRepository.getTopTorrentBlockerNodes();
            return ok(new TorrentBlockerReportsStatsResponseModel({ stats, topUsers, topNodes }));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

function serializeDeployment(deployment: {
    nodeUuid: string;
    pluginUuid: string | null;
    desiredHash: string;
    appliedHash: string;
    state: string;
    lastError: string | null;
    resolutionState: unknown;
    lastAttemptAt: Date | null;
    appliedAt: Date | null;
    checkedAt: Date;
    rolledBack: boolean;
    node: { uuid: string; name: string; isConnected: boolean; countryCode: string };
}): Record<string, unknown> {
    return {
        ...deployment,
        lastAttemptAt: deployment.lastAttemptAt?.toISOString() ?? null,
        appliedAt: deployment.appliedAt?.toISOString() ?? null,
        checkedAt: deployment.checkedAt.toISOString(),
    };
}

function diffJson(
    previous: unknown,
    current: unknown,
    path = '$',
    output: Array<{ path: string; before: unknown; after: unknown }> = [],
): Array<{ path: string; before: unknown; after: unknown }> {
    if (output.length >= 200 || Object.is(previous, current)) return output;
    if (
        previous &&
        current &&
        typeof previous === 'object' &&
        typeof current === 'object' &&
        !Array.isArray(previous) &&
        !Array.isArray(current)
    ) {
        const before = previous as Record<string, unknown>;
        const after = current as Record<string, unknown>;
        const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
        for (const key of [...keys].sort()) {
            diffJson(before[key], after[key], `${path}.${key}`, output);
        }
        return output;
    }
    if (JSON.stringify(previous) !== JSON.stringify(current)) {
        output.push({ path, before: previous ?? null, after: current ?? null });
    }
    return output;
}

function collectEgressDomains(
    config: Record<string, unknown>,
    sharedLists: Array<{ name: string; config: unknown }>,
): string[] {
    const egress = isRecord(config.egressFilter) ? config.egressFilter : {};
    const values = Array.isArray(egress.blockedDomains) ? egress.blockedDomains : [];
    const lists = new Map(
        sharedLists.map((list) => [list.name, isRecord(list.config) ? list.config : {}]),
    );
    const domains: string[] = [];
    for (const value of values) {
        if (typeof value !== 'string') continue;
        if (!value.startsWith('ext:')) {
            domains.push(value);
            continue;
        }
        const external = lists.get(value.slice(4));
        if (external?.type !== 'domainList' || !Array.isArray(external.items)) continue;
        domains.push(...external.items.filter((item): item is string => typeof item === 'string'));
    }
    return [...new Set(domains)].sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
