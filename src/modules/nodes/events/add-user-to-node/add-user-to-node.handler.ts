import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';

import { NodesQueuesService } from '@queue/_nodes';

import { NodesRepository } from '../../repositories/nodes.repository';
import { AddUserToNodeEvent } from './add-user-to-node.event';

@EventsHandler(AddUserToNodeEvent)
export class AddUserToNodeHandler implements IEventHandler<AddUserToNodeEvent> {
    private readonly logger = new Logger(AddUserToNodeHandler.name);
    constructor(
        private readonly nodesRepository: NodesRepository,
        private readonly nodesQueuesService: NodesQueuesService,
    ) {}
    async handle(_event: AddUserToNodeEvent) {
        // Rebuild the current authorized set, including removals after squad/credential changes.
        // No stale password or historical add/remove ordering enters the node queue.
        try {
            const nodes = await this.nodesRepository.findByCriteria({ isDisabled: false });
            for (const node of nodes) {
                if (node.activeConfigProfileUuid && node.activeInbounds.length)
                    await this.nodesQueuesService.reconcileNodeUsers(node.uuid);
            }
        } catch {
            this.logger.error('User authorization reconcile request could not be persisted');
        }
    }
}
