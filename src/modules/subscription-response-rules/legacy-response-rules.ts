import { TResponseRulesConfig } from './types/response-rules.types';

/** Adapt stored rules without deleting their historical database representation. */
export function normalizeStoredResponseRules(
    config: TResponseRulesConfig | null,
): TResponseRulesConfig | null {
    if (!config) return null;
    return {
        ...config,
        rules: config.rules.map((rule) => {
            const modifications = { ...rule.responseModifications } as Record<string, unknown>;
            delete modifications.ignoreHostXrayJsonTemplate;
            delete modifications.ignoreServeJsonAtBaseSubscription;
            return {
                ...rule,
                responseType:
                    (rule.responseType as string) === 'XRAY_JSON'
                        ? 'XRAY_BASE64'
                        : rule.responseType,
                responseModifications: modifications,
            };
        }),
    };
}
