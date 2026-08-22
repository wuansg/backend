import { cloneDeep, get, set, toPath, unset } from 'lodash';

import { THostMapperOperation } from '@libs/contracts/models';

import { ResolvedProxyConfig } from '../resolve-proxy/interfaces';

const HOST_SOURCE_PREFIX = '$host.';
const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);
const HOST_ALLOWED_PATHS = [
    'address',
    'clientOverrides.serverDescription',
    'finalRemark',
    'metadata.inboundTag',
    'metadata.remark',
    'metadata.tags',
    'mux',
    'port',
    'protocol',
    'protocolOptions',
    'security',
    'securityOptions',
    'streamOverrides.finalMask',
    'streamOverrides.sockopt',
    'transport',
    'transportOptions',
].map((path) => toPath(path));

interface CopySource {
    path: string[];
    root: object;
}

function isSafePath(segments: string[]): boolean {
    return segments.length > 0 && segments.every((segment) => !UNSAFE_PATH_SEGMENTS.has(segment));
}

function isBlockedByPrimitive(target: object, path: string): boolean {
    const segments = toPath(path);

    for (let index = 1; index < segments.length; index++) {
        const value = get(target, segments.slice(0, index));

        if (value !== undefined && value !== null && typeof value !== 'object') return true;
    }

    return false;
}

function isAllowedHostPath(segments: string[]): boolean {
    return HOST_ALLOWED_PATHS.some(
        (allowed) =>
            allowed.length <= segments.length &&
            allowed.every((segment, index) => segment === segments[index]),
    );
}

function resolveCopySource(from: string, host: ResolvedProxyConfig): CopySource | null {
    if (!from.startsWith(HOST_SOURCE_PREFIX)) {
        const rawInbound = host.metadata.rawInbound;
        const path = toPath(from);

        if (!rawInbound || typeof rawInbound !== 'object' || !isSafePath(path)) return null;

        return { root: rawInbound, path };
    }

    const path = toPath(from.slice(HOST_SOURCE_PREFIX.length));
    if (!isSafePath(path) || !isAllowedHostPath(path)) return null;

    return { root: host, path };
}

export function applyHostMapper<T extends object>(
    target: T,
    operations: THostMapperOperation[] | undefined,
    host: ResolvedProxyConfig,
    flatTargets = false,
): T {
    if (!operations?.length) return target;

    const result = cloneDeep(target);

    for (const operation of operations) {
        try {
            const to = flatTargets ? [operation.to] : toPath(operation.to);

            if (!isSafePath(to)) continue;
            if (!flatTargets && isBlockedByPrimitive(result, operation.to)) continue;

            switch (operation.op) {
                case 'copy': {
                    const source = resolveCopySource(operation.from, host);
                    if (!source) continue;

                    const value = get(source.root, source.path);
                    if (value === undefined) continue;

                    set(result, to, cloneDeep(value));
                    break;
                }
                case 'set':
                    set(result, to, cloneDeep(operation.value));
                    break;
                case 'unset':
                    unset(result, to);
                    break;
            }
        } catch {
            // A malformed optional mapping must not break the complete subscription.
        }
    }

    return result;
}
