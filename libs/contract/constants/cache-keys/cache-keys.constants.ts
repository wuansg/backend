import { TSubscriptionTemplateType } from '../subscription-template';

export const CACHE_KEYS = {
    SUBSCRIPTION_SETTINGS: 'subscription_settings',
    EXTERNAL_SQUAD_SETTINGS: (uuid: string) => `external_squad_settings:${uuid}`,
    SUBSCRIPTION_TEMPLATE: (name: string, type: TSubscriptionTemplateType) =>
        `subscription_template:${name}:${type}`,
    PASSKEY_REGISTRATION_CHALLENGE: (challenge: string) =>
        `passkey_registration_challenge:${challenge}`,
    PASSKEY_AUTHENTICATION_CHALLENGE: (challenge: string) =>
        `passkey_authentication_challenge:${challenge}`,
    OAUTH2_STATE: (state: string) => `oauth2_state:${state}`,
    REMNAWAVE_SETTINGS: 'remnawave_settings',
    NODE_SYSTEM_INFO: (uuid: string) => `node_system_info:${uuid}`,
    NODE_SYSTEM_STATS: (uuid: string) => `node_system_stats:${uuid}`,
    NODE_USERS_ONLINE: (uuid: string) => `node_users_online:${uuid}`,
    NODE_VERSIONS: (uuid: string) => `node_versions:${uuid}`,
    NODE_CONFIG_APPLY: (uuid: string) => `node_config_apply:${uuid}`,
    NODE_RUNTIME_STATUS: (uuid: string) => `node_runtime_status:${uuid}`,
    NODE_CORE_UPTIME: (uuid: string) => `node_core_uptime:${uuid}`,
    NODE_AGENT_HEALTH_FAILURES: (uuid: string) => `node_agent_health_failures:${uuid}`,
    NODE_CORE_HEALTH_FAILURES: (uuid: string) => `node_core_health_failures:${uuid}`,
    NODE_HEALTH_RECOVERY_SUCCESSES: (uuid: string) => `node_health_recovery_successes:${uuid}`,
    NODE_AGENT_REPAIR_BACKOFF: (uuid: string) => `node_agent_repair_backoff:${uuid}`,
    NODE_CORE_REPAIR_BACKOFF: (uuid: string) => `node_core_repair_backoff:${uuid}`,
    TELEGRAM_TARGET_STATUS: (target: string) => `telegram_target_status:${target}`,
    TELEGRAM_TARGET_SUCCESSES: (target: string) => `telegram_target_successes:${target}`,
    TELEGRAM_TARGET_FAILURES: (target: string) => `telegram_target_failures:${target}`,
    RAW_INBOUND: (uuid: string) => `raw_inbound:${uuid}`,
    XRAY_JSON_TEMPLATE: (uuid: string) => `xray_json_template:${uuid}`,
    EXTERNAL_SQUAD_TEMPLATE_NAME: (uuid: string, type: TSubscriptionTemplateType) =>
        `external_squad_template_name:${uuid}:${type}`,
} as const;

export const CACHE_KEYS_TTL = {
    OAUTH2_STATE: 600, // 10 minutes
    PASSKEY_REGISTRATION_CHALLENGE: 300, // 5 minutes
    PASSKEY_AUTHENTICATION_CHALLENGE: 60, // 1 minute
    REMNAWAVE_SETTINGS: 86_400, // 1 day
    EXTERNAL_SQUAD_SETTINGS: 3_600, // 1 hour
    SUBSCRIPTION_SETTINGS: 3_600, // 1 hour
    NODE_SYSTEM_STATS: 30, // 30 seconds
    NODE_USERS_ONLINE: 45, // 3 scheduler cycles
    NODE_CORE_UPTIME: 16, // 16 seconds
    NODE_RUNTIME_STATUS: 45, // 3 scheduler cycles
    RAW_INBOUND: 3_600, // 1 hour
    XRAY_JSON_TEMPLATE: 3_600, // 1 hour
    EXTERNAL_SQUAD_TEMPLATE_NAME: 3_600, // 1 hour
} as const;

export const INTERNAL_CACHE_KEYS = {
    NODE_USER_USAGE_PREFIX: 'node_user_usage:',
    NODE_USER_USAGE: (nodeId: bigint) =>
        `${INTERNAL_CACHE_KEYS.NODE_USER_USAGE_PREFIX}${nodeId.toString()}`,
    NODE_USER_USAGE_KEYS: 'node_user_usage_keys',
    PROCESSING_POSTFIX: ':processing',
    RUNTIME_METRICS: 'runtime_metrics',
} as const;

export const INTERNAL_CACHE_KEYS_TTL = {
    NODE_USER_USAGE: 10_800, // 3 hours in seconds
} as const;

export const EXPORT_TO_STREAM_KEYS = {
    PREFIX: 'ioraw:',
    USER_USAGE: 'export:user_usage',
    SUBSCRIPTION_REQUESTS: 'export:subscription_requests',
    NODE_CONNECTIONS: 'export:node_connections',
} as const;
