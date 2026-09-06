import { Query } from '@nestjs/cqrs';

import { TResult } from '@common/types';

import { ConfigProfileInboundEntity } from '@modules/config-profiles/entities';

export interface IGetPreparedConfigWithUsersResponse {
    coreType: 'SING_BOX';
    config: Record<string, unknown>;
    hashesPayload: {
        emptyConfig: string;
        inbounds: Array<{ tag: string; hash: string; usersCount: number }>;
    };
}

export class GetPreparedConfigWithUsersQuery extends Query<
    TResult<IGetPreparedConfigWithUsersResponse>
> {
    constructor(
        public readonly configProfileUuid: string,
        public readonly activeInbounds: ConfigProfileInboundEntity[],
    ) {
        super();
    }
}
