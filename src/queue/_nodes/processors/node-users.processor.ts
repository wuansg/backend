import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';

import { PrismaService } from '@common/database/prisma.service';

import { NodeDeploymentsService } from '@modules/node-deployments/node-deployments.service';

import { QUEUES_NAMES } from '@queue/queue.enum';

import { NODES_JOB_NAMES } from '../constants';

// Drain pre-upgrade jobs into the durable reconciler; never replay their stale credentials.
@Processor(QUEUES_NAMES.NODES.USERS, { autorun: false, concurrency: 10 })
export class NodeUsersQueueProcessor extends WorkerHost {
    constructor(
        private readonly db: PrismaService,
        private readonly deployments: NodeDeploymentsService,
    ) {
        super();
    }
    async process(job: Job<{ node: { address: string; port: number | null } }>) {
        if (
            job.name !== NODES_JOB_NAMES.ADD_USER_TO_NODE &&
            job.name !== NODES_JOB_NAMES.REMOVE_USER_FROM_NODE
        )
            return;
        const nodes = await this.db.nodes.findMany({
            where: { address: job.data.node.address, port: job.data.node.port, isDisabled: false },
            select: { uuid: true },
        });
        for (const node of nodes)
            await this.deployments.request(node.uuid, { reason: 'USER_RECONCILE' });
    }
}
