export const SUBSCRIPTION_TEMPLATE_TYPE = {
    // Historical wire value: generic Base64 share links, independent of the node core.
    XRAY_BASE64: 'XRAY_BASE64',
    MIHOMO: 'MIHOMO',

    STASH: 'STASH',
    CLASH: 'CLASH',
    SURGE: 'SURGE',

    SINGBOX: 'SINGBOX',
} as const;

export type TSubscriptionTemplateType = [keyof typeof SUBSCRIPTION_TEMPLATE_TYPE][number];
export const SUBSCRIPTION_TEMPLATE_TYPE_VALUES = Object.values(SUBSCRIPTION_TEMPLATE_TYPE);
