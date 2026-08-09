import { Controller, HttpStatus, Param, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ScopesGuard } from '@common/guards/scopes';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { BANDWIDTH_STATS_USERS_CONTROLLER, CONTROLLERS_INFO } from '@libs/contracts/api';
import {
    GetStatsUserHostsUsageCommand,
    GetStatsUsersUsageCommand,
    GetStatsUserUsageCommand,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import { HostsUsageHistoryService } from '../hosts-usage-history/hosts-usage-history.service';
import {
    GetStatsUserHostsUsageRequestDto,
    GetStatsUserHostsUsageRequestQueryDto,
    GetStatsUserHostsUsageResponseDto,
    GetStatsUsersUsageRequestQueryDto,
    GetStatsUsersUsageResponseDto,
    GetStatsUserUsageParamDto,
    GetStatsUserUsageQueryDto,
    GetStatsUserUsageResponseDto,
} from './dtos';
import { NodesUserUsageHistoryService } from './nodes-user-usage-history.service';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.BANDWIDTH_STATS.resource)
@ApiTags(CONTROLLERS_INFO.BANDWIDTH_STATS.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(BANDWIDTH_STATS_USERS_CONTROLLER)
export class BandwidthStatsUsersController {
    constructor(
        private readonly nodesUserUsageHistoryService: NodesUserUsageHistoryService,
        private readonly hostsUsageHistoryService: HostsUsageHistoryService,
    ) {}

    @Endpoint({
        command: GetStatsUsersUsageCommand,
        httpCode: HttpStatus.OK,
        type: GetStatsUsersUsageResponseDto,
    })
    async getStatsUsersUsage(
        @Query() query: GetStatsUsersUsageRequestQueryDto,
    ): Promise<GetStatsUsersUsageResponseDto> {
        const result = await this.nodesUserUsageHistoryService.getStatsUsersUsage(
            query.start,
            query.end,
            query.topUsersLimit,
        );

        return { response: errorHandler(result) };
    }

    @Endpoint({
        command: GetStatsUserHostsUsageCommand,
        httpCode: HttpStatus.OK,
        type: GetStatsUserHostsUsageResponseDto,
    })
    async getStatsUserHostsUsage(
        @Query() query: GetStatsUserHostsUsageRequestQueryDto,
        @Param() param: GetStatsUserHostsUsageRequestDto,
    ): Promise<GetStatsUserHostsUsageResponseDto> {
        const result = await this.hostsUsageHistoryService.getStatsUserHostsUsage(
            param.userId,
            query.start,
            query.end,
            query.topHostsLimit,
        );

        return { response: errorHandler(result) };
    }

    @Endpoint({
        command: GetStatsUserUsageCommand,
        httpCode: HttpStatus.OK,
        type: GetStatsUserUsageResponseDto,
    })
    async getStatsNodesUsage(
        @Query() query: GetStatsUserUsageQueryDto,
        @Param() param: GetStatsUserUsageParamDto,
    ): Promise<GetStatsUserUsageResponseDto> {
        const result = await this.nodesUserUsageHistoryService.getStatsUserUsage(
            param.userId,
            query.start,
            query.end,
            query.topNodesLimit,
        );

        return { response: errorHandler(result) };
    }
}
