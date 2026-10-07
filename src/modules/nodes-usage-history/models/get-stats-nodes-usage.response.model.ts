import { colorFromUuid } from '@kastov/uuid-color';

import { IGetNodesUsageByRange, ITopNode } from '../interfaces';

export class GetStatsNodesUsageResponseModel {
    public readonly categories: string[];
    public readonly series: {
        uuid: string;
        name: string;
        color: string;
        countryCode: string;
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
    public readonly topNodes: {
        uuid: string;
        name: string;
        color: string;
        countryCode: string;
        total: number;
        upload: number;
        download: number;
    }[];

    constructor(data: {
        categories: string[];
        series: IGetNodesUsageByRange[];
        sparklineData: number[];
        uploadSparklineData?: number[];
        downloadSparklineData?: number[];
        topNodes: ITopNode[];
    }) {
        this.categories = data.categories;
        this.series = data.series.map((item) => ({
            uuid: item.uuid,
            name: item.name,
            color: colorFromUuid(item.uuid),
            countryCode: item.countryCode,
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
        this.topNodes = data.topNodes.map((item) => ({
            uuid: item.uuid,
            name: item.name,
            color: colorFromUuid(item.uuid),
            countryCode: item.countryCode,
            total: Number(item.total),
            upload: Number(item.upload),
            download: Number(item.download),
        }));
    }
}
