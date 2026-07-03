import { IUserInboundUsageStat } from '../../repositories/hosts-usage-history.repository';

export class RecordUserHostUsageCommand {
    constructor(
        public readonly nodeUuid: string,
        public readonly userInbounds: IUserInboundUsageStat[],
        public readonly createdAt: Date = new Date(),
    ) {}
}
