export interface IGetHostsUsageByRange {
    uuid: string;
    remark: string;
    address: string;
    port: number;
    tag: string | null;
    isShared: boolean;
    total: bigint;
    data: bigint[];
}

export interface ITopHost {
    uuid: string;
    remark: string;
    address: string;
    port: number;
    tag: string | null;
    isShared: boolean;
    total: bigint;
}
