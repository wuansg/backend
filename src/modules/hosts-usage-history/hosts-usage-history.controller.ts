import { Controller, HttpStatus, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';

import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { RolesGuard } from '@common/guards/roles';
import { BANDWIDTH_STATS_HOSTS_CONTROLLER, CONTROLLERS_INFO } from '@libs/contracts/api';
import { GetStatsHostsUsageCommand } from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import { GetStatsHostsUsageRequestQueryDto, GetStatsHostsUsageResponseDto } from './dtos';
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
}
