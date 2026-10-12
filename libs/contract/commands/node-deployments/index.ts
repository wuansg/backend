import { z } from 'zod';

import { getEndpointDetails } from '../../constants';
export const NodeDeploymentParamSchema = z.object({ nodeUuid: z.uuid() });
export const NodeRevisionBodySchema = z.object({ revisionUuid: z.uuid() }).strict();
export const NodeBatchBodySchema = z
    .object({ nodeUuids: z.array(z.uuid()).min(1).max(100), canaryUuid: z.uuid() })
    .strict();
export const NodeBatchParamSchema = z.object({ uuid: z.uuid() });
const datetime = z.iso.datetime({ offset: true });
const sequence = z.string().regex(/^[0-9]+$/);
export const NodeDeploymentHistorySchema = z.object({
    nodeUuid: z.uuid(),
    state: z
        .object({
            requestedSeq: sequence,
            processedSeq: sequence,
            pinnedRevisionUuid: z.uuid().nullable(),
            appliedRevisionUuid: z.uuid().nullable(),
            blocked: z.boolean(),
            reason: z.string(),
            attempts: z.int(),
            lastError: z.string().nullable(),
            applying: z.boolean(),
        })
        .nullable(),
    revisions: z.array(
        z.object({
            uuid: z.uuid(),
            profileUuid: z.uuid(),
            templateHash: z.string(),
            inboundTags: z.array(z.string()),
            changedSections: z.array(z.string()),
            createdAt: datetime,
        }),
    ),
    deployments: z.array(
        z.object({
            uuid: z.uuid(),
            nodeUuid: z.uuid(),
            revisionUuid: z.uuid().nullable(),
            batchUuid: z.uuid().nullable(),
            requestSeq: sequence,
            actorUuid: z.uuid().nullable(),
            reason: z.string(),
            state: z.string(),
            requestedHash: z.string().nullable(),
            activeHash: z.string().nullable(),
            errorCode: z.string().nullable(),
            rollback: z.string().nullable(),
            startedAt: datetime,
            finishedAt: datetime.nullable(),
            durationMs: z.int().nullable(),
        }),
    ),
    batches: z.array(
        z.object({
            uuid: z.uuid(),
            state: z.string(),
            nodeUuids: z.array(z.uuid()),
            nextIndex: z.int(),
            activeNodeUuid: z.uuid().nullable(),
            errorCode: z.string().nullable(),
            createdAt: datetime,
            finishedAt: datetime.nullable(),
        }),
    ),
    eligibleNodes: z.array(
        z.object({ uuid: z.uuid(), name: z.string(), isConnected: z.boolean() }),
    ),
});
const requestView = z.object({ response: z.object({ nodeUuid: z.uuid(), requestSeq: sequence }) });
export namespace GetNodeDeploymentHistoryCommand {
    export const endpointDetails = getEndpointDetails(
        'nodes/:nodeUuid',
        'get',
        'Get sanitized node configuration revision and deployment history',
        { scope: 'history-read', kind: 'read' },
    );
    export const ResponseSchema = z.object({ response: NodeDeploymentHistorySchema });
}
export namespace RollbackNodeRevisionCommand {
    export const endpointDetails = getEndpointDetails(
        'nodes/:nodeUuid/rollback',
        'post',
        'Restore a previously healthy configuration with current authorized users',
        { scope: 'rollback', kind: 'write' },
    );
    export const ResponseSchema = requestView;
}
export namespace ResumeNodeProfileCommand {
    export const endpointDetails = getEndpointDetails(
        'nodes/:nodeUuid/resume',
        'post',
        'Unpin a node revision and resume its current profile',
        { scope: 'resume', kind: 'write' },
    );
    export const ResponseSchema = requestView;
}
export namespace CreateNodeDeploymentBatchCommand {
    export const endpointDetails = getEndpointDetails(
        'batches',
        'post',
        'Snapshot a profile and deploy canary-first, stopping on the first failure',
        { scope: 'batch-create', kind: 'write' },
    );
    export const ResponseSchema = z.object({
        response: z.object({
            uuid: z.uuid(),
            state: z.string(),
            canaryUuid: z.uuid(),
            nodes: z.int(),
        }),
    });
}
export namespace CancelNodeDeploymentBatchCommand {
    export const endpointDetails = getEndpointDetails(
        'batches/:uuid/cancel',
        'post',
        'Stop subsequent nodes in a deployment batch',
        { scope: 'batch-cancel', kind: 'write' },
    );
    export const ResponseSchema = z.object({
        response: z.object({ uuid: z.uuid(), state: z.literal('CANCELLED') }),
    });
}
