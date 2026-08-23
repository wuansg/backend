import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';
import { SharedListConfigSchema } from '@libs/node-plugins/models';

import { GetNodesByPluginUuidQuery } from '@modules/nodes/queries/get-nodes-by-plugin-uuid';

import { NodesQueuesService } from '@queue/_nodes';

import { SharedListEntity } from './entities/shared-list.entity';
import { BaseSharedListResponseModel, GetSharedListsResponseModel } from './models';
import { NodePluginRepository } from './repositories/node-plugins.repository';
import { SharedListsRepository } from './repositories/shared-lists.repository';

const MAX_SHARED_LISTS = 256;
const MAX_SHARED_LIST_BYTES = 256 * 1024;

@Injectable()
export class SharedListsService {
    private readonly logger = new Logger(SharedListsService.name);

    constructor(
        private readonly sharedListsRepository: SharedListsRepository,
        private readonly nodePluginRepository: NodePluginRepository,
        private readonly nodeQueuesService: NodesQueuesService,
        private readonly queryBus: QueryBus,
    ) {}

    public async getAllSharedLists(): Promise<TResult<GetSharedListsResponseModel>> {
        try {
            const sharedLists = await this.sharedListsRepository.getAllSharedListsPreview();

            return ok(new GetSharedListsResponseModel(sharedLists, sharedLists.length));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_ALL_SHARED_LISTS_ERROR);
        }
    }

    public async getSharedListByName(name: string): Promise<TResult<BaseSharedListResponseModel>> {
        try {
            const sharedList = await this.sharedListsRepository.findByName(name);

            if (!sharedList) {
                return fail(ERRORS.SHARED_LIST_NOT_FOUND);
            }

            return ok(new BaseSharedListResponseModel(sharedList));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_SHARED_LIST_BY_NAME_ERROR);
        }
    }

    public async createSharedList(
        name: string,
        config: Record<string, unknown>,
    ): Promise<TResult<BaseSharedListResponseModel>> {
        try {
            const existing = await this.sharedListsRepository.getAllSharedListsPreview();
            if (existing.length >= MAX_SHARED_LISTS) {
                return fail(
                    ERRORS.SHARED_LIST_LIMIT_EXCEEDED.withMessage(
                        `At most ${MAX_SHARED_LISTS} shared lists are allowed`,
                    ),
                );
            }
            const validatedConfig = await this.validateConfig(config);

            if (!validatedConfig.isOk) {
                return validatedConfig;
            }

            const sharedList = await this.sharedListsRepository.create(
                new SharedListEntity({
                    name,
                    config: validatedConfig.response,
                }),
            );

            return ok(new BaseSharedListResponseModel(sharedList));
        } catch (error) {
            this.logger.error(error);

            if (this.isNameConflict(error)) {
                return fail(ERRORS.SHARED_LIST_NAME_ALREADY_EXISTS);
            }

            return fail(ERRORS.CREATE_SHARED_LIST_ERROR);
        }
    }

    public async updateSharedList(
        name: string,
        config: Record<string, unknown>,
    ): Promise<TResult<BaseSharedListResponseModel>> {
        try {
            const validatedConfig = await this.validateConfig(config);

            if (!validatedConfig.isOk) {
                return validatedConfig;
            }

            const existingSharedList = await this.sharedListsRepository.findByName(name);

            if (!existingSharedList) {
                return fail(ERRORS.SHARED_LIST_NOT_FOUND);
            }

            const existingType = (existingSharedList.config as Record<string, unknown>).type;
            const nextType = (validatedConfig.response as Record<string, unknown>).type;
            if (existingType !== nextType) {
                return fail(
                    ERRORS.INVALID_SHARED_LIST_CONFIG.withMessage(
                        'Shared list type cannot be changed; create a new list instead',
                    ),
                );
            }

            const sharedList = await this.sharedListsRepository.update({
                name,
                config: validatedConfig.response,
            });

            const syncResult = await this.syncSharedList(name);
            if (!syncResult.isOk) {
                this.logger.warn(`Shared list "${name}" was saved but automatic sync failed`);
            }

            return ok(new BaseSharedListResponseModel(sharedList));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.UPDATE_SHARED_LIST_ERROR);
        }
    }

    public async deleteSharedListByName(name: string): Promise<TResult<boolean>> {
        try {
            const sharedList = await this.sharedListsRepository.findByName(name);

            if (!sharedList) {
                return fail(ERRORS.SHARED_LIST_NOT_FOUND);
            }

            const pluginUuids = await this.nodePluginRepository.getUuidsBySharedListName(name);
            if (pluginUuids.length > 0) {
                return fail(
                    ERRORS.SHARED_LIST_IN_USE.withMessage(
                        `Shared list "${name}" is referenced by ${pluginUuids.length} node plugin(s)`,
                    ),
                );
            }

            await this.sharedListsRepository.deleteByName(name);

            return ok(true);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.DELETE_SHARED_LIST_ERROR);
        }
    }

    public async syncSharedList(name: string): Promise<TResult<boolean>> {
        try {
            const sharedList = await this.sharedListsRepository.findByName(name);

            if (!sharedList) {
                return fail(ERRORS.SHARED_LIST_NOT_FOUND);
            }

            const pluginUuids = await this.nodePluginRepository.getUuidsBySharedListName(name);

            if (pluginUuids.length === 0) {
                return ok(true);
            }

            const nodeUuids = new Set<string>();

            for (const pluginUuid of pluginUuids) {
                const result = await this.queryBus.execute(
                    new GetNodesByPluginUuidQuery(pluginUuid),
                );

                if (!result.isOk) {
                    return fail(ERRORS.INTERNAL_SERVER_ERROR);
                }
                for (const nodeUuid of result.response) {
                    nodeUuids.add(nodeUuid);
                }
            }

            if (nodeUuids.size === 0) {
                return ok(true);
            }

            await this.nodeQueuesService.syncNodePluginsBulk(
                [...nodeUuids].map((nodeUuid) => ({ nodeUuid })),
            );

            this.logger.log(
                `Shared list "${name}" sync queued for ${nodeUuids.size} node(s) across ${pluginUuids.length} plugin(s)`,
            );

            return ok(true);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    private async validateConfig(config: Record<string, unknown>): Promise<TResult<object>> {
        const result = await SharedListConfigSchema.safeParseAsync(config);

        if (result.success) {
            const normalized = {
                ...result.data,
                items: [...new Set<unknown>(result.data.items)],
            };
            const bytes = Buffer.byteLength(JSON.stringify(normalized), 'utf8');
            if (bytes > MAX_SHARED_LIST_BYTES) {
                return fail(
                    ERRORS.SHARED_LIST_LIMIT_EXCEEDED.withMessage(
                        `Shared list must not exceed ${MAX_SHARED_LIST_BYTES} bytes`,
                    ),
                );
            }
            return ok(normalized);
        }

        const message = result.error.issues
            .map(
                (issue) =>
                    `${issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`,
            )
            .join(', ');

        this.logger.error(message);

        return fail(ERRORS.INVALID_SHARED_LIST_CONFIG.withMessage(message));
    }

    private isNameConflict(error: unknown): boolean {
        if (
            error instanceof PrismaClientKnownRequestError &&
            error.code === 'P2002' &&
            error.meta?.modelName === 'SharedLists'
        ) {
            return true;
        }

        return false;
    }
}
