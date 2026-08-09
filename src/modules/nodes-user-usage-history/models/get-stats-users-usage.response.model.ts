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
    public readonly topUsers: IGetUniversalTopUserWithIdConverted[];

    constructor(data: {
        categories: string[];
        series: IGetUniversalUserSeries[];
        sparklineData: number[];
        topUsers: IGetUniversalTopUser[];
    }) {
        this.categories = data.categories;
        this.series = data.series.map((item) => ({
            id: Number(item.id),
            color: colorFromId(item.id),
            username: item.username,
            total: Number(item.total),
            data: item.data.map((value) => Number(value)),
        }));
        this.sparklineData = data.sparklineData;
        this.topUsers = data.topUsers.map((item) => ({
            id: Number(item.userId),
            color: colorFromId(item.userId),
            username: item.username,
            total: Number(item.total),
        }));
    }
}
