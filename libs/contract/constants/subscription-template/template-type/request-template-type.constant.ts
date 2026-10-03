export const REQUEST_TEMPLATE_TYPE = {
    STASH: 'stash',
    SINGBOX: 'singbox',
    MIHOMO: 'mihomo',
    CLASH: 'clash',
    SURGE: 'surge',
} as const;

export type TRequestTemplateType = [keyof typeof REQUEST_TEMPLATE_TYPE][number];
export const REQUEST_TEMPLATE_TYPE_VALUES = Object.values(REQUEST_TEMPLATE_TYPE);
export type TRequestTemplateTypeKeys =
    (typeof REQUEST_TEMPLATE_TYPE)[keyof typeof REQUEST_TEMPLATE_TYPE];
