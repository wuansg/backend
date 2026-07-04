import {
    ApiBearerAuth,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiParam,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import { Controller, HttpStatus, Param, Query, UseFilters, UseGuards } from '@nestjs/common';

import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { RolesGuard } from '@common/guards/roles';
import { GetStatsHostsUsageCommand, GetStatsHostUsersUsageCommand } from '@libs/contracts/commands';
import { BANDWIDTH_STATS_HOSTS_CONTROLLER, CONTROLLERS_INFO } from '@libs/contracts/api';
import { ROLE } from '@libs/contracts/constants';

import {
    GetStatsHostsUsageRequestQueryDto,
    GetStatsHostsUsageResponseDto,
    GetStatsHostUsersUsageRequestDto,
    GetStatsHostUsersUsageRequestQueryDto,
    GetStatsHostUsersUsageResponseDto,
} from './dtos';
import { HostsUsageHistoryService } from './hosts-usage-history.service';

@ApiBearerAuth('Authorization')
@ApiTags(CONTROLLERS_INFO.BANDWIDTH_STATS.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(BANDWIDTH_STATS_HOSTS_CONTROLLER)
export class HostsUsageHistoryController {
    constructor(private readonly hostsUsageHistoryService: HostsUsageHistoryService) {}

    @ApiOkResponse({
        type: GetStatsHostsUsageResponseDto,
        description: 'Stats hosts usage fetched successfully',
    })
    @ApiQuery({
        name: 'end',
        type: String,
        description: 'End date (YYYY-MM-DD)',
        required: true,
        example: '2026-01-01',
        format: 'date',
    })
    @ApiQuery({
        name: 'start',
        type: String,
        description: 'Start date (YYYY-MM-DD)',
        required: true,
        example: '2026-01-31',
        format: 'date',
    })
    @ApiQuery({
        name: 'topHostsLimit',
        type: Number,
        description: 'Limit of top hosts to return',
        required: true,
    })
    @Endpoint({
        command: GetStatsHostsUsageCommand,
        httpCode: HttpStatus.OK,
    })
    async getStatsHostsUsage(
        @Query() query: GetStatsHostsUsageRequestQueryDto,
    ): Promise<GetStatsHostsUsageResponseDto> {
        const { start, end, topHostsLimit } = query;

        const result = await this.hostsUsageHistoryService.getStatsHostsUsage(
            start,
            end,
            topHostsLimit,
        );

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @ApiNotFoundResponse({
        description: 'Host not found',
    })
    @ApiOkResponse({
        type: GetStatsHostUsersUsageResponseDto,
        description: 'Stats host users usage fetched successfully',
    })
    @ApiParam({ name: 'uuid', type: String, description: 'UUID of the host', required: true })
    @ApiQuery({
        name: 'end',
        type: String,
        description: 'End date (YYYY-MM-DD)',
        required: true,
        example: '2026-01-01',
        format: 'date',
    })
    @ApiQuery({
        name: 'start',
        type: String,
        description: 'Start date (YYYY-MM-DD)',
        required: true,
        example: '2026-01-31',
        format: 'date',
    })
    @ApiQuery({
        name: 'topUsersLimit',
        type: Number,
        description: 'Limit of top users to return',
        required: true,
    })
    @Endpoint({
        command: GetStatsHostUsersUsageCommand,
        httpCode: HttpStatus.OK,
    })
    async getStatsHostUsersUsage(
        @Query() query: GetStatsHostUsersUsageRequestQueryDto,
        @Param() paramData: GetStatsHostUsersUsageRequestDto,
    ): Promise<GetStatsHostUsersUsageResponseDto> {
        const result = await this.hostsUsageHistoryService.getStatsHostUsersUsage(
            paramData.uuid,
            query.start,
            query.end,
            query.topUsersLimit,
        );

        const data = errorHandler(result);
        return {
            response: data,
        };
    }
}
