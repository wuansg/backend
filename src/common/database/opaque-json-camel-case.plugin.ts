import { CamelCasePlugin } from 'kysely';

/**
 * Prisma JSON columns contain externally-defined documents. Their keys are data,
 * not database identifiers, and must never be changed by the camel-case mapper.
 *
 * Keep this list in sync with Json/Json? fields in prisma/schema.prisma. The
 * regression script checks that invariant.
 */
export const OPAQUE_JSON_FIELDS = new Set([
    'brandingSettings',
    'config',
    'customRemarks',
    'customResponseHeaders',
    'finalMask',
    'forwardingConfig',
    'mapper',
    'hostOverrides',
    'hwidSettings',
    'ips',
    'metadata',
    'muxParams',
    'oauth2Settings',
    'passkeySettings',
    'passwordSettings',
    'payload',
    'pluginConfig',
    'rawInbound',
    'report',
    'responseHeadersAdd',
    'responseRules',
    'snippet',
    'sockoptParams',
    'subscriptionSettings',
    'templateJson',
    'xhttpExtraParams',
]);

/**
 * Converts database/result structure to camelCase while preserving the content
 * of JSON columns verbatim. This is intentionally different from Kysely's
 * maintainNestedObjectKeys option: relation objects produced by jsonArrayFrom
 * still need their database column names converted.
 */
export class OpaqueJsonCamelCasePlugin extends CamelCasePlugin {
    protected override mapRow(row: Record<string, unknown>): Record<string, unknown> {
        return Object.keys(row).reduce<Record<string, unknown>>((result, key) => {
            const mappedKey = this.camelCase(key);
            let value = row[key];

            if (!OPAQUE_JSON_FIELDS.has(mappedKey)) {
                if (Array.isArray(value)) {
                    value = value.map((item) => (isPlainObject(item) ? this.mapRow(item) : item));
                } else if (isPlainObject(value)) {
                    value = this.mapRow(value);
                }
            }

            result[mappedKey] = value;
            return result;
        }, {});
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object') return false;

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
