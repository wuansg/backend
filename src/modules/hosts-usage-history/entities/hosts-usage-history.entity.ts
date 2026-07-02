import { HostsUsageHistory } from '@prisma/client';

export class HostsUsageHistoryEntity implements HostsUsageHistory {
    public hostUuid: string;
    public nodeUuid: string;
    public inboundTag: string;
    public downloadBytes: bigint;
    public uploadBytes: bigint;
    public totalBytes: bigint;
    public isShared: boolean;
    public createdAt: Date;
    public updatedAt: Date;

    constructor(history: Partial<HostsUsageHistory>) {
        Object.assign(this, history);
        return this;
    }
}
