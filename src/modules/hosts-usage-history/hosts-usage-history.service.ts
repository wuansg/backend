import dayjs from 'dayjs';

import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { getDateRangeArrayUtil } from '@common/utils';
import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { GetUserByUniqueFieldQuery } from '@modules/users/queries/get-user-by-unique-field';
import { HostsRepository } from '@modules/hosts/repositories/hosts.repository';

import { GetStatsHostsUsageResponseModel, GetStatsHostUsersUsageResponseModel } from './models';
import { HostsUsageHistoryRepository } from './repositories/hosts-usage-history.repository';

@Injectable()
export class HostsUsageHistoryService {
    private readonly logger = new Logger(HostsUsageHistoryService.name);
    constructor(
        private readonly hostsUsageHistoryRepository: HostsUsageHistoryRepository,
        private readonly queryBus: QueryBus,
        private readonly hostsRepository: HostsRepository,
    ) {}

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

    async getStatsUserHostsUsage(
        uuid: string,
        start: string,
        end: string,
        topHostsLimit: number,
    ): Promise<TResult<GetStatsHostsUsageResponseModel>> {
        try {
            const user = await this.queryBus.execute(new GetUserByUniqueFieldQuery({ uuid }));
            if (!user.isOk) {
                return fail(ERRORS.USER_NOT_FOUND);
            }

            const { startDate, endDate, dates } = getDateRangeArrayUtil(
                dayjs.utc(start).startOf('day').toDate(),
                dayjs.utc(end).endOf('day').toDate(),
            );

            const dailyTraffic = await this.hostsUsageHistoryRepository.getDailyUserHostsTrafficSum(
                user.response.tId,
                startDate,
                endDate,
                dates,
            );

            const topHosts = await this.hostsUsageHistoryRepository.getTopUserHostsByTraffic(
                user.response.tId,
                startDate,
                endDate,
                topHostsLimit,
            );

            const hostsUsage = await this.hostsUsageHistoryRepository.getUserHostsUsageByRange(
                user.response.tId,
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

    async getStatsHostUsersUsage(
        uuid: string,
        start: string,
        end: string,
        topUsersLimit: number,
    ): Promise<TResult<GetStatsHostUsersUsageResponseModel>> {
        try {
            const host = await this.hostsRepository.findByUUID(uuid);
            if (!host) {
                return fail(ERRORS.HOST_NOT_FOUND);
            }

            const { startDate, endDate, dates } = getDateRangeArrayUtil(
                dayjs.utc(start).startOf('day').toDate(),
                dayjs.utc(end).endOf('day').toDate(),
            );

            const dailyTraffic = await this.hostsUsageHistoryRepository.getHostDailyUsersTrafficSum(
                uuid,
                startDate,
                endDate,
                dates,
            );

            const topUsers = await this.hostsUsageHistoryRepository.getTopHostUsersByTraffic(
                uuid,
                startDate,
                endDate,
                topUsersLimit,
            );

            return ok(
                new GetStatsHostUsersUsageResponseModel({
                    categories: dates,
                    sparklineData: dailyTraffic,
                    topUsers,
                }),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}
