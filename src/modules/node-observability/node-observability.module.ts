import { Global, Module } from '@nestjs/common';

import { NodeObservabilityRepository } from './node-observability.repository';
import { NodeObservabilityService } from './node-observability.service';

@Global()
@Module({
    providers: [NodeObservabilityRepository, NodeObservabilityService],
    exports: [NodeObservabilityRepository, NodeObservabilityService],
})
export class NodeObservabilityModule {}
