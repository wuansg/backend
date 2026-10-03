import { SubscriptionSettingsSchema } from '../subscription-settings.schema';

export const ExternalSquadSubscriptionSettingsSchema = SubscriptionSettingsSchema.pick({
    isShowCustomRemarks: true,
    randomizeHosts: true,
}).partial();
