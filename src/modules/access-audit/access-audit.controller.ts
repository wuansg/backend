import { createZodDto } from 'nestjs-zod';

import {
    Body,
    Controller,
    HttpStatus,
    Logger,
    Param,
    Query,
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
    AuditUserParamSchema,
    AuditPolicyBodySchema,
    AuditQuerySchema,
    GetAuditPolicyCommand as Get,
    SetAuditPolicyCommand as Set,
    GetAuditRecordsCommand as List,
    GetAuditDomainsCommand as Domains,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import type { IJWTAuthPayload } from '@modules/auth/interfaces';

import { AccessAuditService } from './access-audit.service';
class UserParam extends createZodDto(AuditUserParamSchema) {}
class PolicyBody extends createZodDto(AuditPolicyBodySchema) {}
class AuditQuery extends createZodDto(AuditQuerySchema) {}
class PolicyResponse extends createZodDto(Get.ResponseSchema) {}
class RecordsResponse extends createZodDto(List.ResponseSchema) {}
class DomainsResponse extends createZodDto(Domains.ResponseSchema) {}
@ApiBearerAuth('Authorization')
@ApiTags('User Access Audit')
@ApiScopeResource('access-audit')
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
@Controller('access-audit')
export class AccessAuditController {
    private readonly logger = new Logger(AccessAuditController.name);
    constructor(private readonly service: AccessAuditService) {}
    private audit(event: string, user: IJWTAuthPayload, userId?: number) {
        this.logger.log(
            JSON.stringify({ event, actorUuid: user.uuid, actorRole: user.role, userId }),
        );
    }
    @Endpoint({ command: Get, type: PolicyResponse, httpCode: HttpStatus.OK })
    async policy(@Param() p: UserParam) {
        return { response: await this.service.policy(p.userId) };
    }
    @Endpoint({ command: Set, type: PolicyResponse, httpCode: HttpStatus.OK })
    async set(@Param() p: UserParam, @Body() b: PolicyBody, @Req() req: { user: IJWTAuthPayload }) {
        const result = await this.service.setPolicy(p.userId, b);
        this.audit(b.enabled ? 'access-audit-enable' : 'access-audit-disable', req.user, p.userId);
        return { response: result };
    }
    @Endpoint({ command: List, type: RecordsResponse, httpCode: HttpStatus.OK })
    async records(@Query() q: AuditQuery, @Req() req: { user: IJWTAuthPayload }) {
        const result = await this.service.records(q);
        this.audit('access-audit-read', req.user, q.userId);
        return { response: result };
    }
    @Endpoint({ command: Domains, type: DomainsResponse, httpCode: HttpStatus.OK })
    async domains(@Query() q: AuditQuery, @Req() req: { user: IJWTAuthPayload }) {
        const result = await this.service.domains(q);
        this.audit('access-audit-ranking-read', req.user, q.userId);
        return { response: result };
    }
}
