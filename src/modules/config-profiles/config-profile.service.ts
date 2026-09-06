import { Transactional } from '@nestjs-cls/transactional';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { SingBoxConfig } from '@common/helpers/sing-box-config';
import { RawCacheService } from '@common/raw-cache';
import { fail, ok, TResult } from '@common/types';
import { diffInbounds } from '@common/utils/inbounds';
import { CACHE_KEYS } from '@libs/contracts/constants';
import { ERRORS } from '@libs/contracts/constants/errors';

import { NodeForwardingService } from '@modules/nodes/forwarding';
import { NodesRepository } from '@modules/nodes/repositories/nodes.repository';

import { NodesQueuesService } from '@queue/_nodes';

import { ReorderConfigProfilesBodyDto } from './dtos';
import { ConfigProfileWithInboundsAndNodesEntity } from './entities';
import { ConfigProfileInboundEntity } from './entities/config-profile-inbound.entity';
import { ConfigProfileEntity } from './entities/config-profile.entity';
import { GetAllInboundsResponseModel } from './models';
import { GetConfigProfileByUuidResponseModel } from './models/get-config-profile-by-uuid.response.model';
import { GetConfigProfilesResponseModel } from './models/get-config-profiles.response.model';
import { GetSnippetsQuery } from './queries/get-snippets';
import { ConfigProfileRepository } from './repositories/config-profile.repository';

class ForwardingPortConflictError extends Error {}

@Injectable()
export class ConfigProfileService {
    private readonly logger = new Logger(ConfigProfileService.name);

    constructor(
        private readonly configProfileRepository: ConfigProfileRepository,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly queryBus: QueryBus,
        private readonly rawCache: RawCacheService,
        private readonly nodesRepository: NodesRepository,
        private readonly nodeForwardingService: NodeForwardingService,
    ) {}

    public async getConfigProfiles(): Promise<TResult<GetConfigProfilesResponseModel>> {
        try {
            const configProfiles = await this.configProfileRepository.getAllConfigProfiles();

            for (const configProfile of configProfiles) {
                configProfile.config = this.getSortedConfig(
                    configProfile.coreType,
                    configProfile.config as object,
                );
            }

            const total = await this.configProfileRepository.getTotalConfigProfiles();

            return ok(new GetConfigProfilesResponseModel(configProfiles, total));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_CONFIG_PROFILES_ERROR);
        }
    }

    public async getConfigProfileByUUID(
        uuid: string,
    ): Promise<TResult<GetConfigProfileByUuidResponseModel>> {
        try {
            const configProfile = await this.configProfileRepository.getConfigProfileByUUID(uuid);

            if (!configProfile) {
                return fail(ERRORS.CONFIG_PROFILE_NOT_FOUND);
            }

            configProfile.config = this.getSortedConfig(
                configProfile.coreType,
                configProfile.config as object,
            );

            return ok(new GetConfigProfileByUuidResponseModel(configProfile));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_CONFIG_PROFILE_BY_UUID_ERROR);
        }
    }

    public async getComputedConfigProfileByUUID(
        uuid: string,
    ): Promise<TResult<GetConfigProfileByUuidResponseModel>> {
        try {
            const configProfile = await this.configProfileRepository.getConfigProfileByUUID(uuid);

            if (!configProfile) {
                return fail(ERRORS.CONFIG_PROFILE_NOT_FOUND);
            }

            const snippetsMap: Map<string, unknown> = new Map();
            const snippetsResponse = await this.queryBus.execute(new GetSnippetsQuery());

            if (!snippetsResponse.isOk) {
                return fail(ERRORS.INTERNAL_SERVER_ERROR);
            }

            for (const snippet of snippetsResponse.response) {
                snippetsMap.set(snippet.name, snippet.snippet);
            }

            const config = this.createConfigHelper(
                configProfile.coreType,
                configProfile.config as object,
            );
            config.replaceSnippets(snippetsMap);

            configProfile.config = config.getSortedConfig();

            return ok(new GetConfigProfileByUuidResponseModel(configProfile));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_COMPUTED_CONFIG_PROFILE_BY_UUID_ERROR);
        }
    }

    public async deleteConfigProfileByUUID(uuid: string): Promise<TResult<boolean>> {
        try {
            const configProfile = await this.configProfileRepository.getConfigProfileByUUID(uuid);

            if (!configProfile) {
                return fail(ERRORS.CONFIG_PROFILE_NOT_FOUND);
            }

            for (const node of configProfile.nodes) {
                await this.nodesQueuesService.stopNode({
                    nodeUuid: node.uuid,
                    isNeedToBeDeleted: false,
                });
            }

            await this.rawCache.delMany(
                configProfile.inbounds.map((inbound) => CACHE_KEYS.RAW_INBOUND(inbound.uuid)),
            );

            await this.configProfileRepository.deleteByUUID(uuid);

            return ok(true);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.DELETE_CONFIG_PROFILE_BY_UUID_ERROR);
        }
    }

    public async createConfigProfile(
        name: string,
        config: object,
        coreType: 'SING_BOX' = 'SING_BOX',
    ): Promise<TResult<GetConfigProfileByUuidResponseModel>> {
        try {
            if (name === 'Default-Profile') {
                return fail(ERRORS.RESERVED_CONFIG_PROFILE_NAME);
            }

            const validatedConfig = this.createConfigHelper(coreType, config);
            const sortedConfig = validatedConfig.getSortedConfig();

            const profileEntity = new ConfigProfileEntity({
                name,
                coreType,
                config: sortedConfig as object,
            });

            const inbounds = validatedConfig.getAllInbounds();

            const inboundsEntities = inbounds.map(
                (inbound) =>
                    new ConfigProfileInboundEntity({
                        tag: inbound.tag,
                        type: inbound.type,
                        network: inbound.network,
                        security: inbound.security,
                        port: inbound.port,
                        rawInbound: inbound.rawInbound as unknown as object,
                    }),
            );

            const { uuid } = await this.configProfileRepository.create(
                profileEntity,
                inboundsEntities,
            );

            return await this.getConfigProfileByUUID(uuid);
        } catch (error) {
            if (
                error instanceof PrismaClientKnownRequestError &&
                error.code === 'P2002' &&
                (error.meta?.modelName === 'ConfigProfileInbounds' ||
                    error.meta?.modelName === 'ConfigProfiles') &&
                Array.isArray(error.meta.target)
            ) {
                const fields = error.meta.target as string[];
                if (fields.includes('tag')) {
                    return fail(ERRORS.INBOUNDS_WITH_SAME_TAG_ALREADY_EXISTS);
                }
                if (fields.includes('name')) {
                    return fail(ERRORS.CONFIG_PROFILE_NAME_ALREADY_EXISTS);
                }
            }
            this.logger.error(error);
            return fail(ERRORS.CREATE_CONFIG_PROFILE_ERROR);
        }
    }

    public async updateConfigProfile(
        uuid: string,
        name?: string,
        config?: object,
        coreType?: 'SING_BOX',
    ): Promise<TResult<GetConfigProfileByUuidResponseModel>> {
        try {
            const existingConfigProfile =
                await this.configProfileRepository.getConfigProfileByUUID(uuid);

            if (!existingConfigProfile) {
                return fail(ERRORS.CONFIG_PROFILE_NOT_FOUND);
            }

            if (!name && !config && !coreType) {
                return fail(ERRORS.NAME_OR_CONFIG_REQUIRED);
            }

            await this.updateConfigProfileTransactional(
                existingConfigProfile,
                uuid,
                name,
                config,
                coreType,
            );

            if (config || coreType) {
                // No need for now
                // await this.commandBus.execute(new SyncActiveProfileCommand());

                await this.nodesQueuesService.startAllNodesByProfile({
                    profileUuid: existingConfigProfile.uuid,
                    emitter: 'updateConfigProfile',
                });

                await this.rawCache.delMany(
                    existingConfigProfile.inbounds.map((inbound) =>
                        CACHE_KEYS.RAW_INBOUND(inbound.uuid),
                    ),
                );
            }

            return this.getConfigProfileByUUID(existingConfigProfile.uuid);
        } catch (error) {
            this.logger.error(error);

            if (
                error instanceof PrismaClientKnownRequestError &&
                error.code === 'P2002' &&
                (error.meta?.modelName === 'ConfigProfileInbounds' ||
                    error.meta?.modelName === 'ConfigProfiles') &&
                Array.isArray(error.meta.target)
            ) {
                const fields = error.meta.target as string[];
                if (fields.includes('tag')) {
                    return fail(ERRORS.INBOUNDS_WITH_SAME_TAG_ALREADY_EXISTS);
                }
                if (fields.includes('name')) {
                    return fail(ERRORS.CONFIG_PROFILE_NAME_ALREADY_EXISTS);
                }
            }

            if (error instanceof ForwardingPortConflictError) {
                return fail(ERRORS.FORWARDING_PORT_CONFLICT.withMessage(error.message));
            }

            if (error instanceof Error) {
                return fail(ERRORS.CONFIG_VALIDATION_ERROR.withMessage(error.message));
            }

            return fail(ERRORS.UPDATE_CONFIG_PROFILE_ERROR);
        }
    }

    @Transactional()
    public async updateConfigProfileTransactional(
        existingConfigProfile: ConfigProfileWithInboundsAndNodesEntity,
        uuid: string,
        name?: string,
        config?: object,
        coreType?: 'SING_BOX',
    ): Promise<boolean> {
        try {
            const targetCoreType = coreType ?? existingConfigProfile.coreType;
            const configProfileEntity = new ConfigProfileEntity({
                uuid,
                name,
                coreType,
            });

            if (config || coreType) {
                const existingInbounds = existingConfigProfile.inbounds;

                const validatedConfig = this.createConfigHelper(
                    targetCoreType,
                    config ?? (existingConfigProfile.config as object),
                );
                validatedConfig.cleanInboundClients();
                const sortedConfig = validatedConfig.getSortedConfig();
                const inbounds = validatedConfig.getAllInbounds();

                const inboundsEntities = inbounds.map(
                    (inbound) =>
                        new ConfigProfileInboundEntity({
                            profileUuid: existingConfigProfile.uuid,
                            tag: inbound.tag,
                            type: inbound.type,
                            network: inbound.network,
                            security: inbound.security,
                            port: inbound.port,
                            rawInbound: inbound.rawInbound as unknown as object,
                        }),
                );

                for (const nodeReference of existingConfigProfile.nodes) {
                    const node = await this.nodesRepository.findByUUID(nodeReference.uuid);
                    if (!node) continue;
                    const activeTags = new Set(node.activeInbounds.map((inbound) => inbound.tag));
                    const selectedInbounds = inboundsEntities.filter((inbound) =>
                        activeTags.has(inbound.tag),
                    );
                    const conflict = this.nodeForwardingService.validateNodeInbounds(
                        node,
                        selectedInbounds,
                    );
                    if (conflict) {
                        throw new ForwardingPortConflictError(`Node ${node.name}: ${conflict}`);
                    }
                }

                await this.syncInbounds(existingInbounds, inboundsEntities);

                configProfileEntity.config = sortedConfig as object;
            }

            await this.configProfileRepository.update(configProfileEntity);

            return true;
        } catch (error) {
            this.logger.error(error);
            throw error;
        }
    }

    public async getInboundsByProfileUuid(
        profileUuid: string,
    ): Promise<TResult<GetAllInboundsResponseModel>> {
        try {
            const configProfile =
                await this.configProfileRepository.getConfigProfileByUUID(profileUuid);

            if (!configProfile) {
                return fail(ERRORS.CONFIG_PROFILE_NOT_FOUND);
            }

            const inbounds =
                await this.configProfileRepository.getInboundsWithSquadsByProfileUuid(profileUuid);

            return ok(new GetAllInboundsResponseModel(inbounds, inbounds.length));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_INBOUNDS_BY_PROFILE_UUID_ERROR);
        }
    }

    public async getAllInbounds(): Promise<TResult<GetAllInboundsResponseModel>> {
        try {
            const inbounds = await this.configProfileRepository.getAllInbounds();

            return ok(new GetAllInboundsResponseModel(inbounds, inbounds.length));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_ALL_INBOUNDS_ERROR);
        }
    }

    public async reorderConfigProfiles(
        dto: ReorderConfigProfilesBodyDto,
    ): Promise<TResult<GetConfigProfilesResponseModel>> {
        try {
            await this.configProfileRepository.reorderMany(dto.items);

            return await this.getConfigProfiles();
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GENERIC_REORDER_ERROR);
        }
    }

    private async syncInbounds(
        existingInbounds: ConfigProfileInboundEntity[],
        newInbounds: ConfigProfileInboundEntity[],
    ): Promise<void> {
        try {
            const { toAdd, toRemove, toUpdate } = diffInbounds(existingInbounds, newInbounds);

            if (toRemove.length) {
                this.logger.log(`Removing inbounds: ${toRemove.map((i) => i.tag).join(', ')}`);

                await this.configProfileRepository.deleteManyConfigProfileInboundsByUUIDs(
                    toRemove.map((inbound) => inbound.uuid),
                );
            }

            if (toAdd.length) {
                this.logger.log(`Adding inbounds: ${toAdd.map((i) => i.tag).join(', ')}`);
                await this.configProfileRepository.createManyConfigProfileInbounds(toAdd);
            }

            if (toUpdate.length) {
                this.logger.log(`Updating inbounds: ${toUpdate.map((i) => i.tag).join(', ')}`);

                for (const inbound of toUpdate) {
                    await this.configProfileRepository.updateConfigProfileInbound(inbound);
                }
            }

            return;
        } catch (error) {
            if (error instanceof Error) {
                this.logger.error('Failed to sync inbounds:', error.message);
            } else {
                this.logger.error('Failed to sync inbounds:', error);
            }
            throw error;
        }
    }

    private createConfigHelper(coreType: string | undefined, config: object): SingBoxConfig {
        if (coreType !== 'SING_BOX') {
            throw new Error('Only SING_BOX config profiles are supported');
        }
        return new SingBoxConfig(config);
    }

    private getSortedConfig(coreType: string | undefined, config: object): object {
        return this.createConfigHelper(coreType, config).getSortedConfig() as object;
    }
}
