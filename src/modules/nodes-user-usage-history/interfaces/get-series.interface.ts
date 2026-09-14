export interface IGetUniversalSeries {
    uuid: string;
    name: string;
    countryCode: string;
    upload: bigint;
    download: bigint;
    total: bigint;
    uploadData: bigint[];
    downloadData: bigint[];
    data: bigint[];
}

export interface IGetUniversalTopNode {
    uuid: string;
    name: string;
    countryCode: string;
    upload: bigint;
    download: bigint;
    total: bigint;
}

export interface IGetUniversalSeriesConverted {
    uuid: string;
    name: string;
    color: string;
    countryCode: string;
    upload: number;
    download: number;
    total: number;
    uploadData: number[];
    downloadData: number[];
    data: number[];
}

export interface IGetUniversalTopNodeConverted {
    uuid: string;
    color: string;
    name: string;
    countryCode: string;
    upload: number;
    download: number;
    total: number;
}
