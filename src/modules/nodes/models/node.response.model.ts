import type { TNodeIps, TNodeRuntimeStatus } from '@contract/models';

import { fromNanoToNumber } from '@common/utils/nano';

import { ConfigProfileInboundEntity } from '@modules/config-profiles/entities';
import { InfraProviderEntity } from '@modules/infra-billing/entities';

import { NodesEntity } from '../entities';
import {
    INodeConfigApply,
    INodeHotCache,
    INodeRuntimeInventory,
    INodeSystem,
    INodeVersions,
} from '../interfaces';

export class NodeResponseModel {
    public uuid: string;
    public id: number;
    public name: string;
    public address: string;
    public port: null | number;
    public proxyUrl: string | null;
    public isConnected: boolean;
    public isConnecting: boolean;
    public isDisabled: boolean;
    public lastStatusChange: Date | null;
    public lastStatusMessage: null | string;
    public trafficResetDay: null | number;
    public consumptionMultiplier: number;
    public nodeConsumptionMultiplier: number;
    public isTrafficTrackingActive: boolean;
    public trafficLimitBytes: null | number;
    public trafficUsedBytes: null | number;
    public notifyPercent: null | number;
    public note: null | string;
    public viewPosition: number;
    public countryCode: string;
    public tags: string[];
    public expectedAgentVersion: string | null;
    public expectedAgentImageTag: string | null;
    public rolloutBatch: string | null;
    public nodeApiSniEnabled: boolean;
    public nodeApiSniLastSuccessAt: Date | null;
    public ips: TNodeIps;
    public createdAt: Date;
    public updatedAt: Date;

    public configProfile: {
        activeConfigProfileUuid: string | null;
        activeInbounds: ConfigProfileInboundEntity[];
    };
    public providerUuid: string | null;
    public provider: InfraProviderEntity | null;
    public activePluginUuid: string | null;

    public coreUptime: number;
    public usersOnline: number;
    public system: INodeSystem | null;
    public versions: INodeVersions | null;
    public configApply: INodeConfigApply | null;
    public runtimeStatus: TNodeRuntimeStatus | null;
    public runtimeInventory: INodeRuntimeInventory | null;
    public versionDrift: boolean | null;
    public usageSnapshot: {
        receivedThrough: number;
        appliedThrough: number;
        pending: number;
        queueBytes: number;
        capturing: boolean;
        ingestSuccesses: number;
        ingestFailures: number;
        databaseRetries: number;
        lastCapturedAt: Date | null;
        lastSuccessAt: Date | null;
        lastDurationMs: number | null;
        lastError: string | null;
    } | null;

    constructor(data: NodesEntity, hotCache: INodeHotCache) {
        this.uuid = data.uuid;
        this.id = Number(data.id);
        this.name = data.name;
        this.address = data.address;
        this.port = data.port;
        this.proxyUrl = data.proxyUrl;
        this.isConnected = data.isConnected;
        this.isConnecting = data.isConnecting;
        this.isDisabled = data.isDisabled;
        this.lastStatusChange = data.lastStatusChange;
        this.lastStatusMessage = data.lastStatusMessage;
        this.isTrafficTrackingActive = data.isTrafficTrackingActive;
        this.trafficResetDay = data.trafficResetDay;
        this.trafficLimitBytes = Number(data.trafficLimitBytes);
        this.trafficUsedBytes = Number(data.trafficUsedBytes);
        this.notifyPercent = data.notifyPercent;
        this.note = data.note;
        this.consumptionMultiplier = fromNanoToNumber(data.consumptionMultiplier);
        this.nodeConsumptionMultiplier = fromNanoToNumber(data.nodeConsumptionMultiplier);
        this.tags = data.tags;
        this.expectedAgentVersion = data.expectedAgentVersion;
        this.expectedAgentImageTag = data.expectedAgentImageTag;
        this.rolloutBatch = data.rolloutBatch;
        this.nodeApiSniEnabled = data.nodeApiSniEnabled;
        this.nodeApiSniLastSuccessAt = data.nodeApiSniLastSuccessAt;
        this.ips = data.ips;
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;

        this.viewPosition = data.viewPosition;
        this.countryCode = data.countryCode;

        this.configProfile = {
            activeConfigProfileUuid: data.activeConfigProfileUuid,
            activeInbounds: data.activeInbounds,
        };

        this.providerUuid = data.providerUuid;
        this.provider = data.provider;
        this.activePluginUuid = data.activePluginUuid;

        this.system = hotCache.system;
        this.usersOnline = hotCache.onlineUsers;
        this.versions = hotCache.versions;
        this.configApply = hotCache.configApply;
        this.runtimeStatus = hotCache.runtimeStatus;
        this.runtimeInventory = hotCache.runtimeInventory;
        const expectedVersions = [data.expectedAgentVersion, data.expectedAgentImageTag].filter(
            (version): version is string => version !== null,
        );
        this.versionDrift =
            expectedVersions.length === 0
                ? null
                : hotCache.runtimeInventory
                  ? expectedVersions.some(
                        (version) => hotCache.runtimeInventory!.agentVersion !== version,
                    )
                  : null;
        this.coreUptime = hotCache.coreUptime;
        this.usageSnapshot = data.usageSnapshotState
            ? {
                  receivedThrough: Number(data.usageSnapshotState.receivedThrough),
                  appliedThrough: Number(data.usageSnapshotState.appliedThrough),
                  pending: data.usageSnapshotState.pending,
                  queueBytes: Number(data.usageSnapshotState.nodeQueueBytes),
                  capturing: data.usageSnapshotState.capturing,
                  ingestSuccesses: Number(data.usageSnapshotState.ingestSuccesses),
                  ingestFailures: Number(data.usageSnapshotState.ingestFailures),
                  databaseRetries: Number(data.usageSnapshotState.databaseRetries),
                  lastCapturedAt: data.usageSnapshotState.lastCapturedAt,
                  lastSuccessAt: data.usageSnapshotState.lastSuccessAt,
                  lastDurationMs: data.usageSnapshotState.lastDurationMs,
                  lastError: data.usageSnapshotState.lastError,
              }
            : null;
    }
}
