import { IInboundUsageStat } from '../../repositories/hosts-usage-history.repository';

export class RecordHostUsageCommand {
    constructor(
        public readonly nodeUuid: string,
        public readonly inbounds: IInboundUsageStat[],
        public readonly createdAt: Date = new Date(),
    ) {}
}
