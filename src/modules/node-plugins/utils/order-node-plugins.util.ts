import { TNodePlugin } from 'libs/node-plugins';

export const orderNodePluginsConfig = (config: TNodePlugin) => {
    const { sharedLists, ingressFilter, egressFilter, ...rest } = config;

    // Legacy database configurations remain recoverable but are never exposed or applied.
    delete (rest as Record<string, unknown>).torrentBlocker;
    delete (rest as Record<string, unknown>).connectionDrop;

    return {
        ingressFilter,
        egressFilter,
        sharedLists,
        ...rest,
    };
};
