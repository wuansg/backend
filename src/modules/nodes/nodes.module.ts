import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AxiosModule } from '@common/axios';

import { COMMANDS } from './commands';
import { EVENTS } from './events';
import { NodeForwardingService } from './forwarding';
import { NodesSystemCacheService } from './nodes-system-cache.service';
import { NodesController } from './nodes.controller';
import { NodesConverter } from './nodes.converter';
import { NodesService } from './nodes.service';
import { QUERIES } from './queries';
import { NodesRepository } from './repositories/nodes.repository';

@Module({
    imports: [CqrsModule, AxiosModule],
    controllers: [NodesController],
    providers: [
        NodesRepository,
        NodesConverter,
        NodesService,
        NodesSystemCacheService,
        NodeForwardingService,
        ...EVENTS,
        ...QUERIES,
        ...COMMANDS,
    ],
    exports: [NodesRepository, NodeForwardingService],
})
export class NodesModule {}
