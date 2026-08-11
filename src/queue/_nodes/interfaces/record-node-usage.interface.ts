import { INodeConnectionOpts } from '@common/axios';

export interface IRecordNodeUsagePayload {
    nodeId: string;
    nodeUuid: string;
    consumptionMultiplier: string;
    nodeConsumptionMultiplier: string;
    connectionOpts: INodeConnectionOpts;
}
