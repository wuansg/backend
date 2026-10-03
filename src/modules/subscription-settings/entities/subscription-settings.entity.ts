import { SubscriptionSettings } from '@prisma/client';

import { TCustomRemarks, THwidSettings } from '@libs/contracts/models';

import { normalizeStoredResponseRules } from '@modules/subscription-response-rules/legacy-response-rules';
import { TResponseRulesConfig } from '@modules/subscription-response-rules/types/response-rules.types';

export class SubscriptionSettingsEntity implements SubscriptionSettings {
    uuid: string;
    serveJsonAtBaseSubscription: boolean;
    isShowCustomRemarks: boolean;
    customRemarks: TCustomRemarks;
    customResponseHeaders: Record<string, string> | null;
    randomizeHosts: boolean;
    responseRules: TResponseRulesConfig | null;
    hwidSettings: THwidSettings;

    createdAt: Date;
    updatedAt: Date;
    constructor(config: Partial<SubscriptionSettings>) {
        Object.assign(this, config);
        this.responseRules = normalizeStoredResponseRules(this.responseRules);
        return this;
    }
}
