export interface IGetUniversalTopUser {
    uuid: string;
    username: string;
    total: bigint;
}

export interface IGetUniversalTopUserConverted {
    color: string;
    username: string;
    total: number;
}

export interface IGetUniversalUserSeries {
    uuid: string;
    username: string;
    total: bigint;
    data: bigint[];
}

export interface IGetUniversalUserSeriesConverted {
    uuid: string;
    color: string;
    username: string;
    total: number;
    data: number[];
}

export interface IGetUniversalTopUserWithUuidConverted {
    uuid: string;
    color: string;
    username: string;
    total: number;
}
