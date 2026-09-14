export interface IGetUniversalTopUser {
    userId: bigint;
    username: string;
    upload: bigint;
    download: bigint;
    total: bigint;
}

export interface IGetUniversalTopUserConverted {
    color: string;
    userId: number;
    username: string;
    upload: number;
    download: number;
    total: number;
}

export interface IGetUniversalUserSeries {
    id: bigint;
    username: string;
    upload: bigint;
    download: bigint;
    total: bigint;
    uploadData: bigint[];
    downloadData: bigint[];
    data: bigint[];
}

export interface IGetUniversalUserSeriesConverted {
    id: number;
    color: string;
    username: string;
    upload: number;
    download: number;
    total: number;
    uploadData: number[];
    downloadData: number[];
    data: number[];
}

export interface IGetUniversalTopUserWithIdConverted {
    id: number;
    color: string;
    username: string;
    upload: number;
    download: number;
    total: number;
}
