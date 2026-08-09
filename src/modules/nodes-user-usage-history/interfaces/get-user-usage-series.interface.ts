export interface IGetUniversalTopUser {
    userId: bigint;
    username: string;
    total: bigint;
}

export interface IGetUniversalTopUserConverted {
    color: string;
    userId: number;
    username: string;
    total: number;
}

export interface IGetUniversalUserSeries {
    id: bigint;
    username: string;
    total: bigint;
    data: bigint[];
}

export interface IGetUniversalUserSeriesConverted {
    id: number;
    color: string;
    username: string;
    total: number;
    data: number[];
}

export interface IGetUniversalTopUserWithIdConverted {
    id: number;
    color: string;
    username: string;
    total: number;
}
