import { HostsEntity } from './hosts.entity';

type HostWithRawInboundConstructorData = {
    rawInbound: object | null;
    inboundTag: string;
} & ConstructorParameters<typeof HostsEntity>[0];

export class HostWithRawInbound extends HostsEntity {
    public rawInbound: object | null;
    public inboundTag: string;

    constructor(data: HostWithRawInboundConstructorData) {
        super(data);

        this.rawInbound = data.rawInbound;
        this.inboundTag = data.inboundTag;
    }
}
