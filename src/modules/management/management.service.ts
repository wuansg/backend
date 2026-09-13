import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '@common/database/prisma.service';
import { fail, ok, TResult } from '@common/types';
import {
    BulkUpdateManagementTagsCommand,
    ManagementEntityType,
    SearchManagementCatalogCommand,
    TaggableManagementEntityType,
} from '@libs/contracts/commands';
import { ERRORS } from '@libs/contracts/constants';

type CatalogItem = SearchManagementCatalogCommand.Response['response']['items'][number];

const ALL_TYPES: ManagementEntityType[] = [
    'node',
    'host',
    'config-profile',
    'node-plugin',
    'shared-list',
    'subscription-template',
    'subpage-config',
    'internal-squad',
    'external-squad',
];

@Injectable()
export class ManagementService {
    private readonly logger = new Logger(ManagementService.name);

    constructor(private readonly prisma: PrismaService) {}

    public async search(
        input: SearchManagementCatalogCommand.RequestQuery,
    ): Promise<TResult<{ items: CatalogItem[]; total: number }>> {
        try {
            const requested = new Set(
                input.types
                    ?.split(',')
                    .map((type) => type.trim())
                    .filter((type): type is ManagementEntityType =>
                        ALL_TYPES.includes(type as ManagementEntityType),
                    ) ?? ALL_TYPES,
            );
            const q = input.q.trim();
            const tag = input.tag?.trim();
            const perType = Math.min(input.limit, 20);
            const tasks: Array<Promise<CatalogItem[]>> = [];

            if (requested.has('node'))
                tasks.push(
                    this.prisma.nodes
                        .findMany({
                            where: {
                                AND: [
                                    q ? { name: { contains: q, mode: 'insensitive' } } : {},
                                    tag ? { tags: { has: tag } } : {},
                                ],
                            },
                            select: { uuid: true, name: true, tags: true, address: true },
                            take: perType,
                        })
                        .then((rows) =>
                            rows.map((row) => ({
                                type: 'node' as const,
                                id: row.uuid,
                                name: row.name,
                                tags: row.tags,
                                href: `/dashboard/management/nodes?node=${row.uuid}`,
                                description: row.address,
                            })),
                        ),
                );
            if (requested.has('host'))
                tasks.push(
                    this.prisma.hosts
                        .findMany({
                            where: {
                                AND: [
                                    q ? { remark: { contains: q, mode: 'insensitive' } } : {},
                                    tag ? { tags: { has: tag } } : {},
                                ],
                            },
                            select: {
                                uuid: true,
                                remark: true,
                                tags: true,
                                address: true,
                                port: true,
                            },
                            take: perType,
                        })
                        .then((rows) =>
                            rows.map((row) => ({
                                type: 'host' as const,
                                id: row.uuid,
                                name: row.remark,
                                tags: row.tags,
                                href: `/dashboard/management/hosts?host=${row.uuid}`,
                                description: `${row.address}:${row.port}`,
                            })),
                        ),
                );
            if (requested.has('config-profile'))
                tasks.push(
                    this.prisma.configProfiles
                        .findMany({
                            where: {
                                AND: [
                                    q ? { name: { contains: q, mode: 'insensitive' } } : {},
                                    tag ? { tags: { has: tag } } : {},
                                ],
                            },
                            select: { uuid: true, name: true, tags: true, coreType: true },
                            take: perType,
                        })
                        .then((rows) =>
                            rows.map((row) => ({
                                type: 'config-profile' as const,
                                id: row.uuid,
                                name: row.name,
                                tags: row.tags,
                                href: `/dashboard/management/config-profiles/${row.uuid}`,
                                description: row.coreType,
                            })),
                        ),
                );
            if (requested.has('node-plugin'))
                tasks.push(
                    this.prisma.nodePlugin
                        .findMany({
                            where: {
                                AND: [
                                    q ? { name: { contains: q, mode: 'insensitive' } } : {},
                                    tag ? { tags: { has: tag } } : {},
                                ],
                            },
                            select: { uuid: true, name: true, tags: true },
                            take: perType,
                        })
                        .then((rows) =>
                            rows.map((row) => ({
                                type: 'node-plugin' as const,
                                id: row.uuid,
                                name: row.name,
                                tags: row.tags,
                                href: `/dashboard/management/plugins/${row.uuid}`,
                                description: 'Node Plugin',
                            })),
                        ),
                );
            if (requested.has('shared-list') && !tag)
                tasks.push(
                    this.prisma.sharedLists
                        .findMany({
                            where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
                            select: { name: true, config: true },
                            take: perType,
                        })
                        .then((rows) =>
                            rows.map((row) => ({
                                type: 'shared-list' as const,
                                id: row.name,
                                name: row.name,
                                tags: [],
                                href: `/dashboard/management/plugins?sharedList=${encodeURIComponent(row.name)}`,
                                description:
                                    readString((row.config as Record<string, unknown>).type) ??
                                    'Shared List',
                            })),
                        ),
                );
            if (requested.has('subscription-template'))
                tasks.push(
                    this.prisma.subscriptionTemplate
                        .findMany({
                            where: {
                                AND: [
                                    q ? { name: { contains: q, mode: 'insensitive' } } : {},
                                    tag ? { tags: { has: tag } } : {},
                                ],
                            },
                            select: { uuid: true, name: true, tags: true, templateType: true },
                            take: perType,
                        })
                        .then((rows) =>
                            rows.map((row) => ({
                                type: 'subscription-template' as const,
                                id: row.uuid,
                                name: row.name,
                                tags: row.tags,
                                href: `/dashboard/templates/${row.templateType}/${row.uuid}`,
                                description: row.templateType,
                            })),
                        ),
                );
            if (requested.has('subpage-config'))
                tasks.push(
                    this.prisma.subscriptionPageConfig
                        .findMany({
                            where: {
                                AND: [
                                    q ? { name: { contains: q, mode: 'insensitive' } } : {},
                                    tag ? { tags: { has: tag } } : {},
                                ],
                            },
                            select: { uuid: true, name: true, tags: true },
                            take: perType,
                        })
                        .then((rows) =>
                            rows.map((row) => ({
                                type: 'subpage-config' as const,
                                id: row.uuid,
                                name: row.name,
                                tags: row.tags,
                                href: `/dashboard/subpage/${row.uuid}`,
                                description: 'Subscription Page',
                            })),
                        ),
                );
            if (requested.has('internal-squad'))
                tasks.push(
                    this.prisma.internalSquads
                        .findMany({
                            where: {
                                AND: [
                                    q ? { name: { contains: q, mode: 'insensitive' } } : {},
                                    tag ? { tags: { has: tag } } : {},
                                ],
                            },
                            select: { uuid: true, name: true, tags: true },
                            take: perType,
                        })
                        .then((rows) =>
                            rows.map((row) => ({
                                type: 'internal-squad' as const,
                                id: row.uuid,
                                name: row.name,
                                tags: row.tags,
                                href: `/dashboard/management/internal-squads?uuid=${row.uuid}`,
                                description: 'Internal Squad',
                            })),
                        ),
                );
            if (requested.has('external-squad'))
                tasks.push(
                    this.prisma.externalSquads
                        .findMany({
                            where: {
                                AND: [
                                    q ? { name: { contains: q, mode: 'insensitive' } } : {},
                                    tag ? { tags: { has: tag } } : {},
                                ],
                            },
                            select: { uuid: true, name: true, tags: true },
                            take: perType,
                        })
                        .then((rows) =>
                            rows.map((row) => ({
                                type: 'external-squad' as const,
                                id: row.uuid,
                                name: row.name,
                                tags: row.tags,
                                href: `/dashboard/management/external-squads?uuid=${row.uuid}`,
                                description: 'External Squad',
                            })),
                        ),
                );

            const matches = (await Promise.all(tasks)).flat();
            matches.sort(
                (a, b) =>
                    scoreItem(b, q, tag) - scoreItem(a, q, tag) || a.name.localeCompare(b.name),
            );
            return ok({ items: matches.slice(0, input.limit), total: matches.length });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async getTags(type: TaggableManagementEntityType): Promise<TResult<{ tags: string[] }>> {
        try {
            const records = await this.getAllEntityTags(type);
            return ok({ tags: [...new Set(records.flat())].sort((a, b) => a.localeCompare(b)) });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async updateTags(
        type: TaggableManagementEntityType,
        uuid: string,
        tags: string[],
    ): Promise<TResult<{ tags: string[] }>> {
        try {
            await this.updateEntityTags(type, uuid, tags);
            return ok({ tags });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async bulkUpdateTags(
        type: TaggableManagementEntityType,
        input: BulkUpdateManagementTagsCommand.RequestBody,
    ): Promise<TResult<{ updated: number }>> {
        try {
            let updated = 0;
            for (const uuid of input.uuids) {
                const current = await this.getEntityTags(type, uuid);
                if (!current) continue;
                const tags = mergeTags(current, input.tags, input.mode);
                await this.updateEntityTags(type, uuid, tags);
                updated++;
            }
            return ok({ updated });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    private async getAllEntityTags(type: TaggableManagementEntityType): Promise<string[][]> {
        switch (type) {
            case 'node':
                return (await this.prisma.nodes.findMany({ select: { tags: true } })).map(
                    (r) => r.tags,
                );
            case 'host':
                return (await this.prisma.hosts.findMany({ select: { tags: true } })).map(
                    (r) => r.tags,
                );
            case 'config-profile':
                return (await this.prisma.configProfiles.findMany({ select: { tags: true } })).map(
                    (r) => r.tags,
                );
            case 'node-plugin':
                return (await this.prisma.nodePlugin.findMany({ select: { tags: true } })).map(
                    (r) => r.tags,
                );
            case 'subscription-template':
                return (
                    await this.prisma.subscriptionTemplate.findMany({ select: { tags: true } })
                ).map((r) => r.tags);
            case 'subpage-config':
                return (
                    await this.prisma.subscriptionPageConfig.findMany({ select: { tags: true } })
                ).map((r) => r.tags);
            case 'internal-squad':
                return (await this.prisma.internalSquads.findMany({ select: { tags: true } })).map(
                    (r) => r.tags,
                );
            case 'external-squad':
                return (await this.prisma.externalSquads.findMany({ select: { tags: true } })).map(
                    (r) => r.tags,
                );
        }
    }

    private async getEntityTags(
        type: TaggableManagementEntityType,
        uuid: string,
    ): Promise<string[] | null> {
        switch (type) {
            case 'node':
                return (
                    (
                        await this.prisma.nodes.findUnique({
                            where: { uuid },
                            select: { tags: true },
                        })
                    )?.tags ?? null
                );
            case 'host':
                return (
                    (
                        await this.prisma.hosts.findUnique({
                            where: { uuid },
                            select: { tags: true },
                        })
                    )?.tags ?? null
                );
            case 'config-profile':
                return (
                    (
                        await this.prisma.configProfiles.findUnique({
                            where: { uuid },
                            select: { tags: true },
                        })
                    )?.tags ?? null
                );
            case 'node-plugin':
                return (
                    (
                        await this.prisma.nodePlugin.findUnique({
                            where: { uuid },
                            select: { tags: true },
                        })
                    )?.tags ?? null
                );
            case 'subscription-template':
                return (
                    (
                        await this.prisma.subscriptionTemplate.findUnique({
                            where: { uuid },
                            select: { tags: true },
                        })
                    )?.tags ?? null
                );
            case 'subpage-config':
                return (
                    (
                        await this.prisma.subscriptionPageConfig.findUnique({
                            where: { uuid },
                            select: { tags: true },
                        })
                    )?.tags ?? null
                );
            case 'internal-squad':
                return (
                    (
                        await this.prisma.internalSquads.findUnique({
                            where: { uuid },
                            select: { tags: true },
                        })
                    )?.tags ?? null
                );
            case 'external-squad':
                return (
                    (
                        await this.prisma.externalSquads.findUnique({
                            where: { uuid },
                            select: { tags: true },
                        })
                    )?.tags ?? null
                );
        }
    }

    private async updateEntityTags(
        type: TaggableManagementEntityType,
        uuid: string,
        tags: string[],
    ): Promise<void> {
        switch (type) {
            case 'node':
                await this.prisma.nodes.update({ where: { uuid }, data: { tags } });
                return;
            case 'host':
                await this.prisma.hosts.update({ where: { uuid }, data: { tags } });
                return;
            case 'config-profile':
                await this.prisma.configProfiles.update({ where: { uuid }, data: { tags } });
                return;
            case 'node-plugin':
                await this.prisma.nodePlugin.update({ where: { uuid }, data: { tags } });
                return;
            case 'subscription-template':
                await this.prisma.subscriptionTemplate.update({ where: { uuid }, data: { tags } });
                return;
            case 'subpage-config':
                await this.prisma.subscriptionPageConfig.update({
                    where: { uuid },
                    data: { tags },
                });
                return;
            case 'internal-squad':
                await this.prisma.internalSquads.update({ where: { uuid }, data: { tags } });
                return;
            case 'external-squad':
                await this.prisma.externalSquads.update({ where: { uuid }, data: { tags } });
                return;
        }
    }
}

function mergeTags(
    current: string[],
    requested: string[],
    mode: 'REPLACE' | 'ADD' | 'REMOVE',
): string[] {
    if (mode === 'REPLACE') return requested;
    if (mode === 'ADD') return [...new Set([...current, ...requested])].sort();
    const removed = new Set(requested);
    return current.filter((tag) => !removed.has(tag)).sort();
}

function scoreItem(item: CatalogItem, query: string, tag?: string): number {
    const name = item.name.toLowerCase();
    const q = query.toLowerCase();
    return (
        (tag && item.tags.includes(tag) ? 100 : 0) +
        (name === q ? 30 : name.startsWith(q) ? 20 : 10)
    );
}

function readString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}
