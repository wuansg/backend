import { createZodDto } from 'nestjs-zod';

import { Body, Controller, HttpStatus, Param, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeResource } from '@common/decorators/scopes';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ScopesGuard } from '@common/guards/scopes';
import {
    NodeDeploymentParamSchema,
    NodeRevisionBodySchema,
    NodeBatchBodySchema,
    NodeBatchParamSchema,
    GetNodeDeploymentHistoryCommand as History,
    RollbackNodeRevisionCommand as Rollback,
    ResumeNodeProfileCommand as Resume,
    CreateNodeDeploymentBatchCommand as Create,
    CancelNodeDeploymentBatchCommand as Cancel,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import type { IJWTAuthPayload } from '@modules/auth/interfaces';

import { NodeDeploymentsService } from './node-deployments.service';
class NodeParam extends createZodDto(NodeDeploymentParamSchema) {}
class RevisionBody extends createZodDto(NodeRevisionBodySchema) {}
class BatchBody extends createZodDto(NodeBatchBodySchema) {}
class BatchParam extends createZodDto(NodeBatchParamSchema) {}
class HistoryResponse extends createZodDto(History.ResponseSchema) {}
class RollbackResponse extends createZodDto(Rollback.ResponseSchema) {}
class ResumeResponse extends createZodDto(Resume.ResponseSchema) {}
class CreateResponse extends createZodDto(Create.ResponseSchema) {}
class CancelResponse extends createZodDto(Cancel.ResponseSchema) {}
@ApiBearerAuth('Authorization')
@ApiTags('Node Config Deployments')
@ApiScopeResource('node-deployments')
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller('node-deployments')
export class NodeDeploymentsController {
    constructor(private readonly service: NodeDeploymentsService) {}
    @Endpoint({ command: History, type: HistoryResponse, httpCode: HttpStatus.OK })
    async history(@Param() p: NodeParam) {
        return { response: await this.service.history(p.nodeUuid) };
    }
    @Endpoint({ command: Rollback, type: RollbackResponse, httpCode: HttpStatus.OK })
    async rollback(
        @Param() p: NodeParam,
        @Body() b: RevisionBody,
        @Req() req: { user: IJWTAuthPayload },
    ) {
        return { response: await this.service.rollback(p.nodeUuid, b.revisionUuid, req.user.uuid) };
    }
    @Endpoint({ command: Resume, type: ResumeResponse, httpCode: HttpStatus.OK })
    async resume(@Param() p: NodeParam, @Req() req: { user: IJWTAuthPayload }) {
        return { response: await this.service.unpin(p.nodeUuid, req.user.uuid) };
    }
    @Endpoint({ command: Create, type: CreateResponse, httpCode: HttpStatus.CREATED })
    async create(@Body() b: BatchBody, @Req() req: { user: IJWTAuthPayload }) {
        return {
            response: await this.service.createBatch(b.nodeUuids, b.canaryUuid, req.user.uuid),
        };
    }
    @Endpoint({ command: Cancel, type: CancelResponse, httpCode: HttpStatus.OK })
    async cancel(@Param() p: BatchParam) {
        return { response: await this.service.cancelBatch(p.uuid) };
    }
}
