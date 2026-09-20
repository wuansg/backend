import type { TNodeRuntimeStatus } from '@contract/models';

import { INodeSystem } from './node-host-info.interface';

export interface INodeVersions {
    singBox: string | null;
    node: string;
    core: 'SING_BOX' | null;
}

export interface INodeConfigApply {
    status: 'PENDING' | 'APPLIED' | 'UNCHANGED' | 'REJECTED' | 'ROLLED_BACK' | 'FAILED';
    requestedHash: string;
    activeHash: string | null;
    attemptedAt: string;
    appliedAt: string | null;
    rollback: 'NOT_REQUIRED' | 'SUCCEEDED' | 'FAILED' | 'NOT_AVAILABLE';
}

export interface INodeRuntimeInventory {
    agentVersion: string;
    singBoxVersion: string | null;
    architecture: string | null;
    runtimeMode: TNodeRuntimeStatus['mode'];
    runningCore: 'SING_BOX' | null;
    capabilities: string[];
    supportedCores: Array<'SING_BOX'>;
    runtimeStatus: TNodeRuntimeStatus;
    configHashes: unknown;
    pluginHash: string | null;
    forwardingHash: string | null;
    reportedAt: Date;
}

export interface INodeHotCache {
    system: INodeSystem | null;
    versions: INodeVersions | null;
    coreUptime: number;
    onlineUsers: number;
    configApply: INodeConfigApply | null;
    runtimeStatus: TNodeRuntimeStatus | null;
    runtimeInventory: INodeRuntimeInventory | null;
}
