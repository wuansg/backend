import { createZodDto } from 'nestjs-zod';

import {
    Body,
    Controller,
    HttpStatus,
    Logger,
    Param,
    Req,
    UseFilters,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ScopesGuard } from '@common/guards/scopes';
import {
    CreateNodeBenchmarkCommand as Create,
    GetNodeBenchmarksCommand as List,
    GetNodeBenchmarkCommand as Get,
    CancelNodeBenchmarkCommand as Cancel,
    GetBenchmarkTargetsCommand as Targets,
    UpdateBenchmarkTargetCommand as Update,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import type { IJWTAuthPayload } from '@modules/auth/interfaces';

import { NodeBenchmarksService } from './benchmarks.service';
class NodeParam extends createZodDto(Create.RequestParamSchema) {}
class JobParam extends createZodDto(Get.RequestParamSchema) {}
class CreateBody extends createZodDto(Create.RequestBodySchema) {}
class TargetBody extends createZodDto(Update.RequestBodySchema) {}
class TargetParam extends createZodDto(Update.RequestParamSchema) {}
class JobResponse extends createZodDto(Get.ResponseSchema) {}
class ListResponse extends createZodDto(List.ResponseSchema) {}
class TargetsResponse extends createZodDto(Targets.ResponseSchema) {}
class TargetResponse extends createZodDto(Update.ResponseSchema) {}
@ApiBearerAuth('Authorization')
@ApiScopeResource('connections')
@ApiTags('Connections Controller')
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller('connections')
export class NodeBenchmarksController {
    private readonly logger = new Logger(NodeBenchmarksController.name);
    constructor(private readonly service: NodeBenchmarksService) {}
    @Endpoint({ command: Create, type: JobResponse, httpCode: HttpStatus.CREATED })
    async create(
        @Param() p: NodeParam,
        @Body() b: CreateBody,
        @Req() req: { user: IJWTAuthPayload },
    ) {
        const job = await this.service.create(p.nodeUuid, b);
        this.audit('benchmark-create', req.user, { nodeUuid: p.nodeUuid, taskId: job.id });
        return { response: job };
    }
    @Endpoint({ command: List, type: ListResponse, httpCode: HttpStatus.OK })
    async list(@Param() p: NodeParam) {
        return { response: await this.service.list(p.nodeUuid) };
    }
    @Endpoint({ command: Get, type: JobResponse, httpCode: HttpStatus.OK })
    async get(@Param() p: JobParam) {
        return { response: await this.service.get(p.nodeUuid, p.id) };
    }
    @Endpoint({ command: Cancel, type: JobResponse, httpCode: HttpStatus.OK })
    async cancel(@Param() p: JobParam, @Req() req: { user: IJWTAuthPayload }) {
        const job = await this.service.cancel(p.nodeUuid, p.id);
        this.audit('benchmark-cancel', req.user, { nodeUuid: p.nodeUuid, taskId: p.id });
        return { response: job };
    }
    @Endpoint({ command: Targets, type: TargetsResponse, httpCode: HttpStatus.OK })
    async targets() {
        return { response: await this.service.targets() };
    }
    @Endpoint({ command: Update, type: TargetResponse, httpCode: HttpStatus.OK })
    async update(
        @Param() p: TargetParam,
        @Body() b: TargetBody,
        @Req() req: { user: IJWTAuthPayload },
    ) {
        const target = await this.service.updateTarget(p.id, b);
        this.audit('benchmark-target-update', req.user, { targetId: p.id });
        return { response: target };
    }
    private audit(event: string, user: IJWTAuthPayload, details: Record<string, string>) {
        this.logger.log(
            JSON.stringify({ event, actorUuid: user.uuid, actorRole: user.role, ...details }),
        );
    }
}
