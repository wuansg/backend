import { colorFromUuid } from '@kastov/uuid-color';

import {
    IGetUniversalSeries,
    IGetUniversalSeriesConverted,
    IGetUniversalTopNode,
    IGetUniversalTopNodeConverted,
} from '../interfaces';

export class GetStatsUserUsageResponseModel {
    public readonly categories: string[];
    public readonly series: IGetUniversalSeriesConverted[];
    public readonly sparklineData: number[];
    public readonly uploadSparklineData: number[];
    public readonly downloadSparklineData: number[];
    public readonly topNodes: IGetUniversalTopNodeConverted[];

    constructor(data: {
        categories: string[];
        series: IGetUniversalSeries[];
        sparklineData: number[];
        uploadSparklineData: number[];
        downloadSparklineData: number[];
        topNodes: IGetUniversalTopNode[];
    }) {
        this.categories = data.categories;
        this.series = data.series.map((item) => ({
            uuid: item.uuid,
            name: item.name,
            color: colorFromUuid(item.uuid),
            countryCode: item.countryCode,
            upload: Number(item.upload),
            download: Number(item.download),
            total: Number(item.total),
            uploadData: item.uploadData.map((item) => Number(item)),
            downloadData: item.downloadData.map((item) => Number(item)),
            data: item.data.map((item) => Number(item)),
        }));
        this.sparklineData = data.sparklineData;
        this.uploadSparklineData = data.uploadSparklineData;
        this.downloadSparklineData = data.downloadSparklineData;
        this.topNodes = data.topNodes.map((item) => ({
            uuid: item.uuid,
            name: item.name,
            color: colorFromUuid(item.uuid),
            countryCode: item.countryCode,
            upload: Number(item.upload),
            download: Number(item.download),
            total: Number(item.total),
        }));
    }
}
