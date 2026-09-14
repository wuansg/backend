import { UserTraffic } from '@prisma/client';

export class UserTrafficEntity implements UserTraffic {
    public id: bigint;
    public usedTrafficBytes: bigint;
    public lifetimeUsedTrafficBytes: bigint;
    public usedUploadTrafficBytes: bigint;
    public usedDownloadTrafficBytes: bigint;
    public lifetimeUploadTrafficBytes: bigint;
    public lifetimeDownloadTrafficBytes: bigint;
    public firstConnectedAt: Date | null;
    public onlineAt: Date | null;
    public lastConnectedNodeUuid: string | null;

    constructor(traffic: Partial<UserTraffic>) {
        Object.assign(this, traffic);
        return this;
    }
}
