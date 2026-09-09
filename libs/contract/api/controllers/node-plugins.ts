export const NODE_PLUGINS_CONTROLLER = 'node-plugins' as const;

const ACTIONS_ROUTE = 'actions' as const;
const TORRENT_BLOCKER_ROUTE = 'torrent-blocker' as const;
const SHARED_LISTS_ROUTE = 'shared-lists' as const;

const encodeSharedListName = (name: string): string =>
    name.startsWith(':') ? name : encodeURIComponent(name);

export const NODE_PLUGINS_ROUTES = {
    GET_ALL: '', // get
    GET: (uuid: string) => `${uuid}`, // get
    UPDATE: '', // patch
    DELETE: (uuid: string) => `${uuid}`, // delete
    CREATE: '', // post,

    ACTIONS: {
        REORDER: `${ACTIONS_ROUTE}/reorder`,
        CLONE: `${ACTIONS_ROUTE}/clone`,
        SYNC: `${ACTIONS_ROUTE}/sync`,
    },

    EXECUTOR: 'executor',

    TORRENT_BLOCKER: {
        GET_REPORTS: `${TORRENT_BLOCKER_ROUTE}`,
        GET_REPORTS_STATS: `${TORRENT_BLOCKER_ROUTE}/stats`,
        TRUNCATE_REPORTS: `${TORRENT_BLOCKER_ROUTE}/truncate`,
    },
    SHARED_LISTS: {
        GET_ALL: `${SHARED_LISTS_ROUTE}`,
        GET: (name: string) => `${SHARED_LISTS_ROUTE}/${encodeSharedListName(name)}`,
        CREATE: `${SHARED_LISTS_ROUTE}`,
        UPDATE: `${SHARED_LISTS_ROUTE}`,
        DELETE: (name: string) => `${SHARED_LISTS_ROUTE}/${encodeSharedListName(name)}`,
        ACTIONS: {
            SYNC: `${SHARED_LISTS_ROUTE}/${ACTIONS_ROUTE}/sync`,
        },
    },
} as const;
