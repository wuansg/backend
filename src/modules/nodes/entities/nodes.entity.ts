import { NodeUsageSnapshotState, Nodes, Prisma } from '@prisma/client';

import { TNodeIps } from '@libs/contracts/models';

import { ConfigProfileInboundEntity } from '@modules/config-profiles/entities';
import { InfraProviderEntity } from '@modules/infra-billing/entities';

import { INodesWithResolvedInbounds } from '../repositories/nodes.repository';

export class NodesEntity implements Nodes {
    public id: bigint;
    public uuid: string;
    public name: string;
    public address: string;
    public port: null | number;
    public proxyUrl: string | null;
    public forwardingConfig: Prisma.JsonValue;
    public isConnected: boolean;
    public isConnecting: boolean;
    public isDisabled: boolean;
    public lastStatusChange: Date | null;
    public lastStatusMessage: null | string;

    public isTrafficTrackingActive: boolean;
    public trafficResetDay: null | number;
    public trafficLimitBytes: bigint | null;
    public trafficUsedBytes: bigint | null;
    public notifyPercent: null | number;

    public viewPosition: number;
    public countryCode: string;
    public tags: string[];
    public ips: TNodeIps;
    public geocheckIntervalMinutes: number | null;
    public geocheckSource: Prisma.JsonValue | null;
    public geocheckCooldownMinutes: number;
    public lastGeocheckScheduledAt: Date | null;
    public consumptionMultiplier: bigint;
    public nodeConsumptionMultiplier: bigint;
    public createdAt: Date;
    public updatedAt: Date;

    public activeConfigProfileUuid: string | null;
    public activeInbounds: ConfigProfileInboundEntity[];

    public providerUuid: string | null;
    public provider: InfraProviderEntity | null;
    public activePluginUuid: string | null;
    public note: string | null;
    public usageSnapshotState: NodeUsageSnapshotState | null;

    constructor(node: Partial<INodesWithResolvedInbounds & Nodes>) {
        Object.assign(this, node);
        this.forwardingConfig ??= {
            enabled: false,
            listenInterface: 'auto',
            rules: [],
        };

        if (node.configProfileInboundsToNodes) {
            this.activeInbounds = node.configProfileInboundsToNodes.map(
                (value) => new ConfigProfileInboundEntity(value.configProfileInbounds),
            );
        } else {
            this.activeInbounds = [];
        }

        if (node.provider) {
            this.provider = new InfraProviderEntity(node.provider);
        }

        return this;
    }
}
