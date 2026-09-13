import { CONTROLLERS_INFO, MANAGEMENT_CONTROLLER } from '@contract/api';
import { ROLE } from '@contract/constants';

import { Body, Controller, HttpStatus, Param, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ScopesGuard } from '@common/guards/scopes';
import { errorHandler } from '@common/helpers/error-handler.helper';
import {
    BulkUpdateManagementTagsCommand,
    GetManagementTagsCommand,
    SearchManagementCatalogCommand,
    UpdateManagementTagsCommand,
} from '@libs/contracts/commands';

import {
    BulkUpdateManagementTagsBodyDto,
    BulkUpdateManagementTagsParamDto,
    BulkUpdateManagementTagsResponseDto,
    GetManagementTagsParamDto,
    GetManagementTagsResponseDto,
    SearchManagementCatalogQueryDto,
    SearchManagementCatalogResponseDto,
    UpdateManagementTagsBodyDto,
    UpdateManagementTagsParamDto,
    UpdateManagementTagsResponseDto,
} from './dtos/management.dtos';
import { ManagementService } from './management.service';

@ApiBearerAuth('Authorization')
@ApiScopeResource(CONTROLLERS_INFO.MANAGEMENT.resource)
@ApiTags(CONTROLLERS_INFO.MANAGEMENT.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(MANAGEMENT_CONTROLLER)
export class ManagementController {
    constructor(private readonly managementService: ManagementService) {}

    @Endpoint({
        type: SearchManagementCatalogResponseDto,
        command: SearchManagementCatalogCommand,
        httpCode: HttpStatus.OK,
    })
    async search(
        @Query() query: SearchManagementCatalogQueryDto,
    ): Promise<SearchManagementCatalogResponseDto> {
        return { response: errorHandler(await this.managementService.search(query)) };
    }

    @Endpoint({
        type: GetManagementTagsResponseDto,
        command: GetManagementTagsCommand,
        httpCode: HttpStatus.OK,
    })
    async getTags(
        @Param() param: GetManagementTagsParamDto,
    ): Promise<GetManagementTagsResponseDto> {
        return { response: errorHandler(await this.managementService.getTags(param.type)) };
    }

    @Endpoint({
        type: UpdateManagementTagsResponseDto,
        command: UpdateManagementTagsCommand,
        httpCode: HttpStatus.OK,
    })
    async updateTags(
        @Param() param: UpdateManagementTagsParamDto,
        @Body() body: UpdateManagementTagsBodyDto,
    ): Promise<UpdateManagementTagsResponseDto> {
        return {
            response: errorHandler(
                await this.managementService.updateTags(param.type, param.uuid, body.tags),
            ),
        };
    }

    @Endpoint({
        type: BulkUpdateManagementTagsResponseDto,
        command: BulkUpdateManagementTagsCommand,
        httpCode: HttpStatus.OK,
    })
    async bulkUpdateTags(
        @Param() param: BulkUpdateManagementTagsParamDto,
        @Body() body: BulkUpdateManagementTagsBodyDto,
    ): Promise<BulkUpdateManagementTagsResponseDto> {
        return {
            response: errorHandler(await this.managementService.bulkUpdateTags(param.type, body)),
        };
    }
}
