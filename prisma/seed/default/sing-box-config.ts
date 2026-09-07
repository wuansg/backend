export const SING_BOX_DEFAULT_CONFIG = {
    log: {
        level: 'info',
        timestamp: true,
    },
    inbounds: [],
    outbounds: [
        {
            type: 'direct',
            tag: 'direct',
        },
    ],
    route: {
        final: 'direct',
    },
};
