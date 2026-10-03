import { AddUserCommand, AddUsersCommand } from '@remnawave/node-contract';

// sing-box-only additions to the legacy node SDK wire contract.
type SingBoxUserType = 'snell' | 'anytls' | 'hysteria2' | 'tuic' | 'vmess' | 'shadowtls';
export type AddNodeUserRequest = Omit<AddUserCommand.Request, 'data'> & {
    data: Array<
        | AddUserCommand.Request['data'][number]
        | {
              type: SingBoxUserType;
              tag: string;
              username: string;
              password: string;
              uuid?: string;
          }
    >;
};
type BulkUser = AddUsersCommand.Request['users'][number];
export type AddNodeUsersRequest = Omit<AddUsersCommand.Request, 'users'> & {
    users: Array<{
        userData: BulkUser['userData'] & { anytlsPassword: string; snellPsk: string };
        inboundData: Array<
            BulkUser['inboundData'][number] | { type: SingBoxUserType; tag: string }
        >;
    }>;
};
