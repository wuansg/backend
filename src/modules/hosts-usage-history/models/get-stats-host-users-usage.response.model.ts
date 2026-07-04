import { colorFromUuid } from '@kastov/uuid-color';

import { ITopHostUser } from '../interfaces';

export class GetStatsHostUsersUsageResponseModel {
    public readonly categories: string[];
    public readonly sparklineData: number[];
    public readonly topUsers: {
        color: string;
        username: string;
        total: number;
    }[];

    constructor(data: { categories: string[]; sparklineData: number[]; topUsers: ITopHostUser[] }) {
        this.categories = data.categories;
        this.sparklineData = data.sparklineData;
        this.topUsers = data.topUsers.map((item) => ({
            color: colorFromUuid(item.uuid),
            username: item.username,
            total: Number(item.total),
        }));
    }
}
