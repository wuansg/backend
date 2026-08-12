import { Query } from '@nestjs/cqrs';

import { INodeConnectionOpts } from '@common/axios';
import { TResult } from '@common/types';

export interface IGetEnabledNodesPartialResponse {
    uuid: string;
    isConnected: boolean;
    expectsCore: boolean;
    connectionOpts: INodeConnectionOpts;
}

export class GetEnabledNodesPartialQuery extends Query<TResult<IGetEnabledNodesPartialResponse[]>> {
    constructor() {
        super();
    }
}
