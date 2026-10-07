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
        upload: number;
        download: number;
        data: number[];
        uploadData: number[];
        downloadData: number[];
    }[];
    public readonly sparklineData: number[];
    public readonly uploadSparklineData: number[];
    public readonly downloadSparklineData: number[];
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
        upload: number;
        download: number;
    }[];

    constructor(data: {
        categories: string[];
        series: IGetHostsUsageByRange[];
        sparklineData: number[];
        uploadSparklineData?: number[];
        downloadSparklineData?: number[];
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
            upload: Number(item.upload),
            download: Number(item.download),
            data: item.data.map((item) => Number(item)),
            uploadData: item.uploadData.map((item) => Number(item)),
            downloadData: item.downloadData.map((item) => Number(item)),
        }));
        this.sparklineData = data.sparklineData;
        this.uploadSparklineData = data.uploadSparklineData ?? [];
        this.downloadSparklineData = data.downloadSparklineData ?? [];
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
            upload: Number(item.upload),
            download: Number(item.download),
        }));
    }
}
