import { colorFromId } from '@kastov/uuid-color';

import { IGetUniversalTopUser, IGetUniversalTopUserConverted } from '../interfaces';

export class GetStatsNodesUsersUsageResponseModel {
    public readonly categories: string[];

    public readonly sparklineData: number[];
    public readonly uploadSparklineData: number[];
    public readonly downloadSparklineData: number[];
    public readonly topUsers: IGetUniversalTopUserConverted[];

    constructor(data: {
        categories: string[];
        sparklineData: number[];
        uploadSparklineData: number[];
        downloadSparklineData: number[];
        topUsers: IGetUniversalTopUser[];
    }) {
        this.categories = data.categories;
        this.sparklineData = data.sparklineData;
        this.uploadSparklineData = data.uploadSparklineData;
        this.downloadSparklineData = data.downloadSparklineData;
        this.topUsers = data.topUsers.map((item) => ({
            color: colorFromId(item.userId),
            userId: Number(item.userId),
            username: item.username,
            upload: Number(item.upload),
            download: Number(item.download),
            total: Number(item.total),
        }));
    }
}
