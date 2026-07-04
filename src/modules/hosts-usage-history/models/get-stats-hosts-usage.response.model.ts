import { colorFromUuid } from '@kastov/uuid-color';

import { IGetHostsUsageByRange, ITopHost } from '../interfaces';

export class GetStatsHostsUsageResponseModel {
    public readonly categories: string[];
    public readonly series: {
        uuid: string;
        groupKey: string;
        nodeUuid: string;
        inboundTag: string;
        remark: string;
        address: string;
        port: number;
        tag: string | null;
        isShared: boolean;
        hosts: {
            uuid: string;
            remark: string;
            address: string;
            port: number;
        }[];
        color: string;
        total: number;
        data: number[];
    }[];
    public readonly sparklineData: number[];
    public readonly topHosts: {
        uuid: string;
        groupKey: string;
        nodeUuid: string;
        inboundTag: string;
        remark: string;
        address: string;
        port: number;
        tag: string | null;
        isShared: boolean;
        hosts: {
            uuid: string;
            remark: string;
            address: string;
            port: number;
        }[];
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
            groupKey: item.groupKey,
            nodeUuid: item.nodeUuid,
            inboundTag: item.inboundTag,
            remark: item.remark,
            address: item.address,
            port: item.port,
            tag: item.tag,
            isShared: item.isShared,
            hosts: item.hosts,
            color: colorFromUuid(item.uuid),
            total: Number(item.total),
            data: item.data.map((item) => Number(item)),
        }));
        this.sparklineData = data.sparklineData;
        this.topHosts = data.topHosts.map((item) => ({
            uuid: item.uuid,
            groupKey: item.groupKey,
            nodeUuid: item.nodeUuid,
            inboundTag: item.inboundTag,
            remark: item.remark,
            address: item.address,
            port: item.port,
            tag: item.tag,
            isShared: item.isShared,
            hosts: item.hosts,
            color: colorFromUuid(item.uuid),
            total: Number(item.total),
        }));
    }
}
