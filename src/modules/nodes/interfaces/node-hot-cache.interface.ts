import { INodeSystem } from './node-host-info.interface';

export interface INodeVersions {
    xray: string;
    singBox: string | null;
    node: string;
    core: 'SING_BOX' | 'XRAY' | null;
}

export interface INodeConfigApply {
    status: 'PENDING' | 'APPLIED' | 'UNCHANGED' | 'REJECTED' | 'ROLLED_BACK' | 'FAILED';
    requestedHash: string;
    activeHash: string | null;
    attemptedAt: string;
    appliedAt: string | null;
    rollback: 'NOT_REQUIRED' | 'SUCCEEDED' | 'FAILED' | 'NOT_AVAILABLE';
}

export interface INodeHotCache {
    system: INodeSystem | null;
    versions: INodeVersions | null;
    xrayUptime: number;
    onlineUsers: number;
    configApply: INodeConfigApply | null;
}
