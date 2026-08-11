export interface IGetHostsUsageByRange {
    uuid: string;
    groupKey: string;
    nodeUuid: string;
    inboundTag: string;
    remark: string;
    address: string;
    port: number;
    tag: string | null;
    isShared: boolean;
    hosts: IHostUsageMember[];
    total: bigint;
    data: bigint[];
}

export interface ITopHost {
    uuid: string;
    groupKey: string;
    nodeUuid: string;
    inboundTag: string;
    remark: string;
    address: string;
    port: number;
    tag: string | null;
    isShared: boolean;
    hosts: IHostUsageMember[];
    total: bigint;
}

export interface IHostUsageMember {
    uuid: string;
    remark: string;
    address: string;
    port: number;
}

export interface ITopHostUser {
    userId: bigint;
    username: string;
    total: bigint;
}
