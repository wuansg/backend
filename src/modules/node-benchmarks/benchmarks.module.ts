import { Module } from '@nestjs/common';

import { AxiosModule } from '@common/axios';

import { NodeBenchmarksController } from './benchmarks.controller';
import { NodeBenchmarksService } from './benchmarks.service';
@Module({
    imports: [AxiosModule],
    providers: [NodeBenchmarksService],
    controllers: [NodeBenchmarksController],
})
export class NodeBenchmarksModule {}
