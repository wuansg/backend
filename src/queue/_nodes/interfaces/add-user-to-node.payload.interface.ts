import { INodeConnectionOpts } from '@common/axios';
import { AddNodeUserRequest } from '@common/axios/node-user-requests';

export interface IAddUserToNodePayload {
    data: AddNodeUserRequest;
    node: INodeConnectionOpts;
}
