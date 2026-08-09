export const BANDWIDTH_STATS_CONTROLLER = 'bandwidth-stats' as const;

export const BANDWIDTH_STATS_NODES_ROUTE = 'nodes' as const;
export const BANDWIDTH_STATS_HOSTS_ROUTE = 'hosts' as const;
export const BANDWIDTH_STATS_USERS_ROUTE = 'users' as const;
export const BANDWIDTH_STATS_INTERNAL_SQUADS_ROUTE = 'internal-squads' as const;

export const BANDWIDTH_STATS_NODES_CONTROLLER =
    `${BANDWIDTH_STATS_CONTROLLER}/${BANDWIDTH_STATS_NODES_ROUTE}` as const;
export const BANDWIDTH_STATS_HOSTS_CONTROLLER =
    `${BANDWIDTH_STATS_CONTROLLER}/${BANDWIDTH_STATS_HOSTS_ROUTE}` as const;
export const BANDWIDTH_STATS_USERS_CONTROLLER =
    `${BANDWIDTH_STATS_CONTROLLER}/${BANDWIDTH_STATS_USERS_ROUTE}` as const;
export const BANDWIDTH_STATS_INTERNAL_SQUADS_CONTROLLER =
    `${BANDWIDTH_STATS_CONTROLLER}/${BANDWIDTH_STATS_INTERNAL_SQUADS_ROUTE}` as const;

export const BANDWIDTH_STATS_ROUTES = {
    NODES: {
        GET: '',
        GET_REALTIME: 'realtime',
        GET_USERS: (uuid: string) => `${uuid}/users`,
        GET_USERS_BY_NODES: 'users',
        GET_USAGE: 'usage',
    },
    HOSTS: {
        // GET /bandwidth-stats/hosts –– Hosts -> Metrics
        GET: '',
        // GET /bandwidth-stats/hosts/:hostUuid/users –– Hosts -> Management -> Show usage
        GET_USERS: (uuid: string) => `${uuid}/users`,
    },
    USERS: {
        // GET /bandwidth-stats/users –– Users -> Metrics
        GET: '',
        // GET /bandwidth-stats/users/:userId –– Users -> User -> Show Usage
        GET_BY_ID: (userId: string) => `${userId}`,
        // GET /bandwidth-stats/users/:userId/hosts –– Users -> User -> Show Usage -> Hosts
        GET_HOSTS_BY_ID: (userId: string) => `${userId}/hosts`,
    },
    INTERNAL_SQUADS: {
        GET_USAGE: (uuid: string) => `${uuid}/usage`,
        USER_USAGE: (squadUuid: string, userId: string) => `${squadUuid}/users/${userId}/usage`,
    },
} as const;
