type RuntimeNode = { activeConfigProfileUuid: string | null; activeInbounds: { uuid: string }[] };
export function nodeUpdateNeedsApply(node: RuntimeNode, update: Record<string, unknown>): boolean {
    const current = node as RuntimeNode & Record<string, unknown>;
    const connection = ['address', 'port', 'proxyUrl', 'nodeApiSniEnabled', 'activePluginUuid'];
    if (connection.some((key) => update[key] !== undefined && update[key] !== current[key]))
        return true;
    const profile = update.configProfile as
        | { activeConfigProfileUuid: string; activeInbounds: string[] }
        | undefined;
    return Boolean(
        profile &&
        (profile.activeConfigProfileUuid !== node.activeConfigProfileUuid ||
            JSON.stringify([...profile.activeInbounds].sort()) !==
                JSON.stringify(node.activeInbounds.map((i) => i.uuid).sort())),
    );
}
