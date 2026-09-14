import { colorFromId } from '@kastov/uuid-color';

import { ITopHostUser } from '../interfaces';

export class GetStatsHostUsersUsageResponseModel {
    public readonly categories: string[];
    public readonly sparklineData: number[];
    public readonly uploadSparklineData: number[];
    public readonly downloadSparklineData: number[];
    public readonly topUsers: {
        color: string;
        username: string;
        upload: number;
        download: number;
        total: number;
    }[];

    constructor(data: {
        categories: string[];
        sparklineData: number[];
        uploadSparklineData: number[];
        downloadSparklineData: number[];
        topUsers: ITopHostUser[];
    }) {
        this.categories = data.categories;
        this.sparklineData = data.sparklineData;
        this.uploadSparklineData = data.uploadSparklineData;
        this.downloadSparklineData = data.downloadSparklineData;
        this.topUsers = data.topUsers.map((item) => ({
            color: colorFromId(item.userId),
            username: item.username,
            upload: Number(item.upload),
            download: Number(item.download),
            total: Number(item.total),
        }));
    }
}
