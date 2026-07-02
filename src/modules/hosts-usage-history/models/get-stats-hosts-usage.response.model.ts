import { colorFromUuid } from '@kastov/uuid-color';

import { IGetHostsUsageByRange, ITopHost } from '../interfaces';

export class GetStatsHostsUsageResponseModel {
    public readonly categories: string[];
    public readonly series: {
        uuid: string;
        remark: string;
        address: string;
        port: number;
        tag: string | null;
        isShared: boolean;
        color: string;
        total: number;
        data: number[];
    }[];
    public readonly sparklineData: number[];
    public readonly topHosts: {
        uuid: string;
        remark: string;
        address: string;
        port: number;
        tag: string | null;
        isShared: boolean;
        color: string;
        total: number;
    }[];

    constructor(data: {
        categories: string[];
        series: IGetHostsUsageByRange[];
        sparklineData: number[];
        topHosts: ITopHost[];
    }) {
        this.categories = data.categories;
        this.series = data.series.map((item) => ({
            uuid: item.uuid,
            remark: item.remark,
            address: item.address,
            port: item.port,
            tag: item.tag,
            isShared: item.isShared,
            color: colorFromUuid(item.uuid),
            total: Number(item.total),
            data: item.data.map((item) => Number(item)),
        }));
        this.sparklineData = data.sparklineData;
        this.topHosts = data.topHosts.map((item) => ({
            uuid: item.uuid,
            remark: item.remark,
            address: item.address,
            port: item.port,
            tag: item.tag,
            isShared: item.isShared,
            color: colorFromUuid(item.uuid),
            total: Number(item.total),
        }));
    }
}
