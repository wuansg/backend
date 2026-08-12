import { INodeConnectionOpts } from '@common/axios';

export interface INodeHealthCheckPayload {
    nodeUuid: string;
    isConnected: boolean;
    expectsCore: boolean;
    connectionOpts: INodeConnectionOpts;
}
