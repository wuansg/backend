import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { NodePluginController } from './node-plugins.controller';
import { NodePluginConverter } from './node-plugins.converter';
import { NodePluginService } from './node-plugins.service';
import { QUERIES } from './queries';
import { NodePluginRepository } from './repositories/node-plugins.repository';
import { SharedListsRepository } from './repositories/shared-lists.repository';
import { SharedListsConverter } from './shared-lists.converter';
import { SharedListsService } from './shared-lists.service';

@Module({
    imports: [CqrsModule],
    controllers: [NodePluginController],
    providers: [
        NodePluginService,
        NodePluginRepository,
        NodePluginConverter,
        SharedListsService,
        SharedListsRepository,
        SharedListsConverter,
        ...QUERIES,
    ],
    exports: [],
})
export class NodePluginModule {}
