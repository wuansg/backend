import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AxiosModule } from '@common/axios';

import { QUEUES_NAMES } from '@queue/queue.enum';

import { NodeDeploymentsController } from './node-deployments.controller';
import { NodeDeploymentsService } from './node-deployments.service';
@Global()
@Module({
    imports: [
        CqrsModule,
        AxiosModule,
        BullModule.registerQueue({ name: QUEUES_NAMES.NODES.START }),
    ],
    providers: [NodeDeploymentsService],
    controllers: [NodeDeploymentsController],
    exports: [NodeDeploymentsService],
})
export class NodeDeploymentsModule {}
