import dayjs from 'dayjs';

import { Injectable, Logger } from '@nestjs/common';

import { getDateRangeArrayUtil } from '@common/utils';
import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { HostsUsageHistoryRepository } from './repositories/hosts-usage-history.repository';
import { GetStatsHostsUsageResponseModel } from './models';

@Injectable()
export class HostsUsageHistoryService {
    private readonly logger = new Logger(HostsUsageHistoryService.name);
    constructor(private readonly hostsUsageHistoryRepository: HostsUsageHistoryRepository) {}

    async getStatsHostsUsage(
        start: string,
        end: string,
        topHostsLimit: number,
    ): Promise<TResult<GetStatsHostsUsageResponseModel>> {
        try {
            const { startDate, endDate, dates } = getDateRangeArrayUtil(
                dayjs.utc(start).startOf('day').toDate(),
                dayjs.utc(end).endOf('day').toDate(),
            );

            const dailyTraffic = await this.hostsUsageHistoryRepository.getDailyTrafficSum(
                startDate,
                endDate,
                dates,
            );

            const topHosts = await this.hostsUsageHistoryRepository.getTopHostsByTraffic(
                startDate,
                endDate,
                topHostsLimit,
            );

            const hostsUsage = await this.hostsUsageHistoryRepository.getHostsUsageByRange(
                startDate,
                endDate,
                dates,
            );

            return ok(
                new GetStatsHostsUsageResponseModel({
                    categories: dates,
                    series: hostsUsage,
                    sparklineData: dailyTraffic,
                    topHosts,
                }),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}
