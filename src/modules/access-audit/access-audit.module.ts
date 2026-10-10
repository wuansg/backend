import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AxiosModule } from '@common/axios';

import { AccessAuditController } from './access-audit.controller';
import { AccessAuditService } from './access-audit.service';
@Module({
    imports: [CqrsModule, AxiosModule],
    providers: [AccessAuditService],
    controllers: [AccessAuditController],
})
export class AccessAuditModule {}
