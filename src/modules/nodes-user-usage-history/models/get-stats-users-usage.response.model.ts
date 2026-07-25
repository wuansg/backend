import { colorFromUuid } from '@kastov/uuid-color';

import {
    IGetUniversalTopUser,
    IGetUniversalTopUserWithUuidConverted,
    IGetUniversalUserSeries,
    IGetUniversalUserSeriesConverted,
} from '../interfaces';

export class GetStatsUsersUsageResponseModel {
    public readonly categories: string[];

    public readonly series: IGetUniversalUserSeriesConverted[];
    public readonly sparklineData: number[];
    public readonly topUsers: IGetUniversalTopUserWithUuidConverted[];

    constructor(data: {
        categories: string[];
        series: IGetUniversalUserSeries[];
        sparklineData: number[];
        topUsers: IGetUniversalTopUser[];
    }) {
        this.categories = data.categories;
        this.series = data.series.map((item) => ({
            uuid: item.uuid,
            color: colorFromUuid(item.uuid),
            username: item.username,
            total: Number(item.total),
            data: item.data.map((value) => Number(value)),
        }));
        this.sparklineData = data.sparklineData;
        this.topUsers = data.topUsers.map((item) => ({
            uuid: item.uuid,
            color: colorFromUuid(item.uuid),
            username: item.username,
            total: Number(item.total),
        }));
    }
}
