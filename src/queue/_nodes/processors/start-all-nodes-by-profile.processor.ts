import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { FindNodesByCriteriaQuery } from '@modules/nodes/queries/find-nodes-by-criteria';

import { NodesQueuesService } from '@queue/_nodes';

import { QUEUES_NAMES } from '../../queue.enum';
import { NODES_JOB_NAMES } from '../constants';

// All paths use the same per-node durable reconciler and lease. No global queue pause,
// alternate core-apply path, or concurrent user delta can bypass revision tracking.
@Processor(QUEUES_NAMES.NODES.START_ALL_BY_PROFILE, { autorun: false, concurrency: 3 })
export class StartAllNodesByProfileQueueProcessor extends WorkerHost {
    private readonly logger = new Logger(StartAllNodesByProfileQueueProcessor.name);
    constructor(
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly queryBus: QueryBus,
    ) {
        super();
    }
    async process(
        job: Job<{
            profileUuid: string;
            force?: boolean;
            actorUuid?: string | null;
            clearPin?: boolean;
        }>,
    ) {
        if (job.name !== NODES_JOB_NAMES.START_ALL_BY_PROFILE) return;
        const nodes = await this.queryBus.execute(
            new FindNodesByCriteriaQuery({
                ...(job.data.clearPin ? {} : { isDisabled: false }),
                activeConfigProfileUuid: job.data.profileUuid,
            }),
        );
        if (!nodes.isOk) throw Error('Cannot resolve profile nodes');
        for (const node of nodes.response)
            await this.nodesQueuesService.startNode({
                nodeUuid: node.uuid,
                force: job.data.force,
                actorUuid: job.data.actorUuid,
                reason: job.data.clearPin ? 'PROFILE_APPLY' : 'NODE_REFRESH',
                clearPin: job.data.clearPin,
            });
        this.logger.log(
            `Queued ${nodes.response.length} independently tracked node configurations`,
        );
    }
}
