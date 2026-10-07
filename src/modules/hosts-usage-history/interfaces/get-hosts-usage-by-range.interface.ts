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
    upload: bigint;
    download: bigint;
    data: bigint[];
    uploadData: bigint[];
    downloadData: bigint[];
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
    upload: bigint;
    download: bigint;
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
    upload: bigint;
    download: bigint;
    total: bigint;
}
