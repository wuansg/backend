export interface IGetNodesUsageByRange {
    uuid: string;
    name: string;
    countryCode: string;
    total: bigint;
    upload: bigint;
    download: bigint;
    data: bigint[];
    uploadData: bigint[];
    downloadData: bigint[];
}

export interface ITopNode {
    uuid: string;
    name: string;
    countryCode: string;
    total: bigint;
    upload: bigint;
    download: bigint;
}
