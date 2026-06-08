import { ConfigProfileInboundEntity } from './config-profile-inbound.entity';

export interface ConfigProfileInboundNode {
    uuid: string;
    name: string;
    countryCode: string;
}

export class ConfigProfileInboundWithNodesEntity extends ConfigProfileInboundEntity {
    public nodes: ConfigProfileInboundNode[];

    constructor(configProfileInbound: Partial<ConfigProfileInboundWithNodesEntity>) {
        super(configProfileInbound);
        this.nodes = configProfileInbound.nodes ?? [];
    }
}
