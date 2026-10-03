import { HwidHeaders } from '@common/utils/extract-hwid-headers';
import { TResponseRulesResponseType } from '@libs/contracts/constants';

import { SubscriptionSettingsEntity } from '@modules/subscription-settings/entities';

import { TResponseRuleEncryption } from '../types/response-rules.types';

export interface ISRRContext {
    userAgent: string;
    hwidHeaders: HwidHeaders | null;
    isExtendedClient: boolean;
    matchedResponseType: TResponseRulesResponseType;
    matchedRuleName?: string;
    ip: string;
    subscriptionSettings: SubscriptionSettingsEntity;
    overrideTemplateName?: string;
    headersToApply?: Record<string, string>;
    disableHwidCheck?: boolean;
    encryption?: TResponseRuleEncryption;
    excludeHostsByTags?: Set<string>;
    respondWithRemarks?: string[];
}
