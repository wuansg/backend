import { Job, Worker } from 'bullmq';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WorkerHost } from '@nestjs/bullmq';
import { DiscoveryService } from '@nestjs/core';

import {
    QueueWorkerLifecycleService,
    QueueWorkerStartGuard,
} from './queue-worker-lifecycle.service';

interface FakeWorker {
    isRunning(): boolean;
    name: string;
    run(): Promise<void>;
}

class TestWorkerHost extends WorkerHost implements QueueWorkerStartGuard {
    constructor(
        worker: FakeWorker,
        private readonly allowed = true,
    ) {
        super();
        (this as unknown as { _worker: Worker })._worker = worker as unknown as Worker;
    }

    async prepareQueueWorkerStart(): Promise<boolean> {
        return this.allowed;
    }

    async process(_job: Job): Promise<void> {}
}

function createLifecycle(instances: unknown[]): QueueWorkerLifecycleService {
    const discovery = {
        getProviders: () => instances.map((instance) => ({ instance })),
    } as unknown as DiscoveryService;
    return new QueueWorkerLifecycleService(discovery);
}

describe('QueueWorkerLifecycleService', () => {
    it('starts workers once only after explicitly released', async () => {
        let running = false;
        let runCalls = 0;
        const worker: FakeWorker = {
            name: 'ready-worker',
            isRunning: () => running,
            run: async () => {
                runCalls++;
                running = true;
            },
        };
        const lifecycle = createLifecycle([new TestWorkerHost(worker)]);

        assert.equal(runCalls, 0);
        assert.equal(await lifecycle.startAll(), 1);
        assert.equal(runCalls, 1);
        assert.equal(await lifecycle.startAll(), 0);
        assert.equal(runCalls, 1);
    });

    it('does not start workers rejected by their start guard', async () => {
        let runCalls = 0;
        const worker: FakeWorker = {
            name: 'disabled-worker',
            isRunning: () => false,
            run: async () => {
                runCalls++;
            },
        };
        const lifecycle = createLifecycle([new TestWorkerHost(worker, false)]);

        assert.equal(await lifecycle.startAll(), 0);
        assert.equal(runCalls, 0);
    });
});
