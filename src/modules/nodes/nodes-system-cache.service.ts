import type { TNodeRuntimeStatus } from '@contract/models';
import type { NodeRuntimeInventory } from '@prisma/client';

import { CACHE_KEYS } from '@contract/constants';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '@common/database/prisma.service';
import { RawCacheService } from '@common/raw-cache';

import {
    INodeConfigApply,
    INodeHotCache,
    INodeRuntimeInventory,
    INodeSystem,
    INodeVersions,
} from './interfaces';

@Injectable()
export class NodesSystemCacheService {
    constructor(
        private readonly rawCacheService: RawCacheService,
        private readonly prisma: PrismaService,
    ) {}

    async getMany(nodes: { uuid: string }[]): Promise<Map<string, INodeHotCache>> {
        const pipe = this.rawCacheService.createPipeline();
        for (const node of nodes) {
            pipe.get(CACHE_KEYS.NODE_SYSTEM_INFO(node.uuid));
            pipe.get(CACHE_KEYS.NODE_SYSTEM_STATS(node.uuid));
            pipe.get(CACHE_KEYS.NODE_USERS_ONLINE(node.uuid));
            pipe.get(CACHE_KEYS.NODE_VERSIONS(node.uuid));
            pipe.get(CACHE_KEYS.NODE_CORE_UPTIME(node.uuid));
            pipe.get(CACHE_KEYS.NODE_CONFIG_APPLY(node.uuid));
            pipe.get(CACHE_KEYS.NODE_RUNTIME_STATUS(node.uuid));
        }

        const [results, persistedInventories] = await Promise.all([
            pipe.exec(),
            this.prisma.nodeRuntimeInventory.findMany({
                where: { nodeUuid: { in: nodes.map(({ uuid }) => uuid) } },
            }),
        ]);
        const inventoryByNode = new Map(
            persistedInventories.map((inventory) => [inventory.nodeUuid, inventory]),
        );
        const map = new Map<string, INodeHotCache>();

        const KEYS_PER_NODE = 7;

        if (!results) {
            for (const node of nodes) {
                const runtimeInventory = this.mapRuntimeInventory(inventoryByNode.get(node.uuid));
                map.set(node.uuid, {
                    system: null,
                    versions: this.versionsFromInventory(runtimeInventory),
                    coreUptime: 0,
                    onlineUsers: 0,
                    configApply: null,
                    runtimeStatus: runtimeInventory?.runtimeStatus ?? null,
                    runtimeInventory,
                });
            }
            return map;
        }

        for (let i = 0; i < nodes.length; i++) {
            const runtimeInventory = this.mapRuntimeInventory(inventoryByNode.get(nodes[i].uuid));
            const base = i * KEYS_PER_NODE;
            const [infoErr, rawInfo] = results[base];
            const [statsErr, rawStats] = results[base + 1];
            const [onlineErr, rawOnline] = results[base + 2];
            const [versionsErr, rawVersions] = results[base + 3];
            const [uptimeErr, rawUptime] = results[base + 4];
            const [configApplyErr, rawConfigApply] = results[base + 5];
            const [runtimeStatusErr, rawRuntimeStatus] = results[base + 6];

            const system =
                !infoErr && !statsErr && rawInfo && rawStats
                    ? {
                          info: JSON.parse(rawInfo as string),
                          stats: JSON.parse(rawStats as string),
                      }
                    : null;

            const versions =
                !versionsErr && rawVersions
                    ? JSON.parse(rawVersions as string)
                    : this.versionsFromInventory(runtimeInventory);
            const coreUptime = !uptimeErr && rawUptime ? Number(rawUptime) : 0;
            const onlineUsers = !onlineErr && rawOnline ? Number(rawOnline) : 0;
            const configApply =
                !configApplyErr && rawConfigApply
                    ? (JSON.parse(rawConfigApply as string) as INodeConfigApply)
                    : null;
            const runtimeStatus: TNodeRuntimeStatus | null =
                !runtimeStatusErr && rawRuntimeStatus
                    ? (JSON.parse(rawRuntimeStatus as string) as TNodeRuntimeStatus)
                    : (runtimeInventory?.runtimeStatus ?? null);

            map.set(nodes[i].uuid, {
                system,
                versions,
                coreUptime,
                onlineUsers,
                configApply,
                runtimeStatus,
                runtimeInventory,
            });
        }

        return map;
    }

    async getOne(uuid: string): Promise<INodeHotCache> {
        const [
            info,
            stats,
            cachedVersions,
            coreUptime,
            onlineUsers,
            configApply,
            cachedRuntimeStatus,
            persistedInventory,
        ] = await Promise.all([
            this.rawCacheService.get<INodeSystem['info']>(CACHE_KEYS.NODE_SYSTEM_INFO(uuid)),
            this.rawCacheService.get<INodeSystem['stats']>(CACHE_KEYS.NODE_SYSTEM_STATS(uuid)),
            this.rawCacheService.get<INodeVersions>(CACHE_KEYS.NODE_VERSIONS(uuid)),
            this.rawCacheService.getNumber(CACHE_KEYS.NODE_CORE_UPTIME(uuid)),
            this.rawCacheService.getNumber(CACHE_KEYS.NODE_USERS_ONLINE(uuid)),
            this.rawCacheService.get<INodeConfigApply>(CACHE_KEYS.NODE_CONFIG_APPLY(uuid)),
            this.rawCacheService.get<TNodeRuntimeStatus>(CACHE_KEYS.NODE_RUNTIME_STATUS(uuid)),
            this.prisma.nodeRuntimeInventory.findUnique({ where: { nodeUuid: uuid } }),
        ]);

        const runtimeInventory = this.mapRuntimeInventory(persistedInventory ?? undefined);
        const versions = cachedVersions ?? this.versionsFromInventory(runtimeInventory);
        const runtimeStatus = cachedRuntimeStatus ?? runtimeInventory?.runtimeStatus ?? null;

        let system: INodeSystem | null = null;
        if (info && stats) {
            system = {
                info: info,
                stats: stats,
            };
        }

        return {
            system,
            versions,
            coreUptime,
            onlineUsers,
            configApply,
            runtimeStatus,
            runtimeInventory,
        };
    }

    private mapRuntimeInventory(inventory?: NodeRuntimeInventory): INodeRuntimeInventory | null {
        if (!inventory) return null;
        return {
            agentVersion: inventory.agentVersion,
            singBoxVersion: inventory.singBoxVersion,
            architecture: inventory.architecture,
            runtimeMode: inventory.runtimeMode as INodeRuntimeInventory['runtimeMode'],
            runningCore: inventory.runningCore as INodeRuntimeInventory['runningCore'],
            capabilities: inventory.capabilities,
            supportedCores: inventory.supportedCores as INodeRuntimeInventory['supportedCores'],
            runtimeStatus: inventory.runtimeStatus as unknown as TNodeRuntimeStatus,
            configHashes: inventory.configHashes,
            pluginHash: inventory.pluginHash,
            forwardingHash: inventory.forwardingHash,
            reportedAt: inventory.reportedAt,
        };
    }

    private versionsFromInventory(inventory: INodeRuntimeInventory | null): INodeVersions | null {
        if (!inventory) return null;
        return {
            node: inventory.agentVersion,
            singBox: inventory.singBoxVersion,
            core: inventory.runningCore,
        };
    }

    async delete(uuid: string): Promise<void> {
        await this.rawCacheService.delMany([
            CACHE_KEYS.NODE_SYSTEM_INFO(uuid),
            CACHE_KEYS.NODE_SYSTEM_STATS(uuid),
            CACHE_KEYS.NODE_USERS_ONLINE(uuid),
            CACHE_KEYS.NODE_VERSIONS(uuid),
            CACHE_KEYS.NODE_CORE_UPTIME(uuid),
            CACHE_KEYS.NODE_CONFIG_APPLY(uuid),
            CACHE_KEYS.NODE_RUNTIME_STATUS(uuid),
        ]);
    }

    async getTotalOnlineUsers(nodes: { uuid: string }[]): Promise<number> {
        const pipe = this.rawCacheService.createPipeline();
        for (const node of nodes) {
            pipe.get(CACHE_KEYS.NODE_USERS_ONLINE(node.uuid));
        }

        const results = await pipe.exec();
        if (!results) return 0;

        return results.reduce((sum, [err, raw]) => sum + (!err && raw ? Number(raw) : 0), 0);
    }
}
