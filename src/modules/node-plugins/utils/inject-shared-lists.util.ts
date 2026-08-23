import { SharedListEntity } from '../entities/shared-list.entity';

const EXT_PREFIX = 'ext:';
const SHARED_LISTS_KEY = 'sharedLists';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const collectReferences = (value: unknown, references: Set<string>): void => {
    if (typeof value === 'string') {
        if (value.startsWith(EXT_PREFIX)) {
            references.add(value.slice(EXT_PREFIX.length));
        }

        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectReferences(item, references);
        }

        return;
    }

    if (isRecord(value)) {
        for (const nested of Object.values(value)) {
            collectReferences(nested, references);
        }
    }
};

export const collectSharedListReferences = (pluginConfig: unknown): Set<string> => {
    const references = new Set<string>();
    const config = isRecord(pluginConfig) ? { ...pluginConfig } : {};

    delete config[SHARED_LISTS_KEY];
    collectReferences(config, references);

    return references;
};

const getNestedArray = (value: unknown, path: string[]): unknown[] => {
    let current = value;
    for (const key of path) {
        if (!isRecord(current)) return [];
        current = current[key];
    }
    return Array.isArray(current) ? current : [];
};

export const validateSharedListReferences = (
    pluginConfig: unknown,
    sharedLists: SharedListEntity[],
): string[] => {
    const types = new Map(
        sharedLists.map((list) => [
            list.name,
            isRecord(list.config) && typeof list.config.type === 'string'
                ? list.config.type
                : 'unknown',
        ]),
    );
    const fields: Array<{ path: string[]; expected: string }> = [
        { path: ['torrentBlocker', 'ignoreLists', 'ip'], expected: 'ipList' },
        { path: ['connectionDrop', 'whitelistIps'], expected: 'ipList' },
        { path: ['ingressFilter', 'blockedIps'], expected: 'ipList' },
        { path: ['egressFilter', 'blockedIps'], expected: 'ipList' },
        { path: ['egressFilter', 'blockedDomains'], expected: 'domainList' },
        { path: ['egressFilter', 'blockedPorts'], expected: 'portList' },
    ];
    const errors: string[] = [];

    for (const field of fields) {
        for (const item of getNestedArray(pluginConfig, field.path)) {
            if (typeof item !== 'string' || !item.startsWith(EXT_PREFIX)) continue;
            const name = item.slice(EXT_PREFIX.length);
            const actual = types.get(name);
            if (!actual) {
                errors.push(`${item} was not found`);
            } else if (actual !== field.expected) {
                errors.push(
                    `${item} has type ${actual}; ${field.path.join('.')} requires ${field.expected}`,
                );
            }
        }
    }

    return errors;
};

export function injectSharedLists(
    pluginConfig: unknown,
    sharedLists: SharedListEntity[],
): Record<string, unknown> {
    const config = isRecord(pluginConfig) ? { ...pluginConfig } : {};

    delete config[SHARED_LISTS_KEY];

    const references = collectSharedListReferences(config);

    config[SHARED_LISTS_KEY] = sharedLists
        .filter((sharedList) => references.has(sharedList.name))
        .map((sharedList) => ({
            ...sharedList.config,
            name: `${EXT_PREFIX}${sharedList.name}`,
        }));

    return config;
}
