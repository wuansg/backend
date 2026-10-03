import { INodeConnectionOpts } from '@common/axios';
import { AddNodeUsersRequest } from '@common/axios/node-user-requests';

export interface IAddUsersToNodePayload {
    data: AddNodeUsersRequest;
    node: INodeConnectionOpts;
}
