import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AxiosModule } from '@common/axios';

import { NodeBenchmarksController } from './benchmarks.controller';
import { NodeBenchmarksService } from './benchmarks.service';
@Module({
    imports: [CqrsModule, AxiosModule],
    providers: [NodeBenchmarksService],
    controllers: [NodeBenchmarksController],
})
export class NodeBenchmarksModule {}
