import { ConfigProfiles } from '@prisma/client';

export class ConfigProfileEntity implements ConfigProfiles {
    public uuid: string;
    public viewPosition: number;
    public name: string;
    public tags: string[];
    public coreType: string;
    public config: object;

    public createdAt: Date;
    public updatedAt: Date;

    constructor(configProfile: Partial<ConfigProfiles>) {
        this.tags = [];
        Object.assign(this, configProfile);
        return this;
    }
}
