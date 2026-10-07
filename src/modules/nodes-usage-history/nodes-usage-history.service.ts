import dayjs from 'dayjs';

import { Injectable, Logger } from '@nestjs/common';

import { fail, ok, TResult } from '@common/types';
import { getDateRangeArrayUtil } from '@common/utils';
import { ERRORS } from '@libs/contracts/constants';
import { TrafficDirection } from '@libs/contracts/models';

import { GetStatsNodesUsageResponseModel } from './models';
import { NodesUsageHistoryRepository } from './repositories/nodes-usage-history.repository';

@Injectable()
export class NodesUsageHistoryService {
    private readonly logger = new Logger(NodesUsageHistoryService.name);
    constructor(private readonly nodeUsageHistoryRepository: NodesUsageHistoryRepository) {}

    async getStatsNodesUsage(
        start: string,
        end: string,
        topNodesLimit: number,
        direction: TrafficDirection = 'total',
    ): Promise<TResult<GetStatsNodesUsageResponseModel>> {
        try {
            const { startDate, endDate, dates } = getDateRangeArrayUtil(
                dayjs.utc(start).startOf('day').toDate(),
                dayjs.utc(end).endOf('day').toDate(),
            );

            const dailyTraffic =
                await this.nodeUsageHistoryRepository.getDirectionalDailyTrafficSum(
                    startDate,
                    endDate,
                    dates,
                );

            const topNodes = await this.nodeUsageHistoryRepository.getTopNodesByTraffic(
                startDate,
                endDate,
                topNodesLimit,
                direction,
            );

            const nodesUsage = await this.nodeUsageHistoryRepository.getNodesUsageByRange(
                startDate,
                endDate,
                dates,
                direction,
            );

            return ok(
                new GetStatsNodesUsageResponseModel({
                    categories: dates,
                    series: nodesUsage,
                    sparklineData: dailyTraffic.total,
                    uploadSparklineData: dailyTraffic.upload,
                    downloadSparklineData: dailyTraffic.download,
                    topNodes: topNodes,
                }),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}
