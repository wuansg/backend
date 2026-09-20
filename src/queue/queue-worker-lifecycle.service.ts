import { WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';

export interface QueueWorkerStartGuard {
    prepareQueueWorkerStart(): boolean | Promise<boolean>;
}

function hasStartGuard(workerHost: WorkerHost): workerHost is WorkerHost & QueueWorkerStartGuard {
    return (
        'prepareQueueWorkerStart' in workerHost &&
        typeof workerHost.prepareQueueWorkerStart === 'function'
    );
}

@Injectable()
export class QueueWorkerLifecycleService {
    private readonly logger = new Logger(QueueWorkerLifecycleService.name);
    private started = false;

    constructor(private readonly discoveryService: DiscoveryService) {}

    public async startAll(): Promise<number> {
        if (this.started) return 0;

        const workerHosts = this.discoveryService
            .getProviders()
            .map((wrapper) => wrapper.instance)
            .filter((instance): instance is WorkerHost => instance instanceof WorkerHost);

        let startedWorkers = 0;
        for (const workerHost of workerHosts) {
            if (hasStartGuard(workerHost) && !(await workerHost.prepareQueueWorkerStart())) {
                continue;
            }

            const worker = workerHost.worker;
            if (worker.isRunning()) continue;

            void worker.run().catch((error: unknown) => {
                this.logger.error(`Queue worker "${worker.name}" stopped unexpectedly: ${error}`);
            });
            startedWorkers++;
        }

        this.started = true;
        this.logger.log(`Started ${startedWorkers} queue workers after application bootstrap.`);
        return startedWorkers;
    }
}
