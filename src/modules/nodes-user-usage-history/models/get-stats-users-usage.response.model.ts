import { colorFromId } from '@kastov/uuid-color';

import {
    IGetUniversalTopUser,
    IGetUniversalTopUserWithIdConverted,
    IGetUniversalUserSeries,
    IGetUniversalUserSeriesConverted,
} from '../interfaces';

export class GetStatsUsersUsageResponseModel {
    public readonly categories: string[];

    public readonly series: IGetUniversalUserSeriesConverted[];
    public readonly sparklineData: number[];
    public readonly uploadSparklineData: number[];
    public readonly downloadSparklineData: number[];
    public readonly topUsers: IGetUniversalTopUserWithIdConverted[];

    constructor(data: {
        categories: string[];
        series: IGetUniversalUserSeries[];
        sparklineData: number[];
        uploadSparklineData: number[];
        downloadSparklineData: number[];
        topUsers: IGetUniversalTopUser[];
    }) {
        this.categories = data.categories;
        this.series = data.series.map((item) => ({
            id: Number(item.id),
            color: colorFromId(item.id),
            username: item.username,
            upload: Number(item.upload),
            download: Number(item.download),
            total: Number(item.total),
            uploadData: item.uploadData.map((value) => Number(value)),
            downloadData: item.downloadData.map((value) => Number(value)),
            data: item.data.map((value) => Number(value)),
        }));
        this.sparklineData = data.sparklineData;
        this.uploadSparklineData = data.uploadSparklineData;
        this.downloadSparklineData = data.downloadSparklineData;
        this.topUsers = data.topUsers.map((item) => ({
            id: Number(item.userId),
            color: colorFromId(item.userId),
            username: item.username,
            upload: Number(item.upload),
            download: Number(item.download),
            total: Number(item.total),
        }));
    }
}
