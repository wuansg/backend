import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { ManagementController } from './management.controller';
import { ManagementService } from './management.service';

@Module({
    imports: [CqrsModule],
    controllers: [ManagementController],
    providers: [ManagementService],
})
export class ManagementModule {}
