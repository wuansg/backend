export const MANAGEMENT_CONTROLLER = 'management' as const;

const CATALOG_ROUTE = 'catalog' as const;

export const MANAGEMENT_ROUTES = {
    SEARCH: `${CATALOG_ROUTE}/search`,
    TAGS: (type: string) => `${CATALOG_ROUTE}/${type}/tags`,
    ENTITY_TAGS: (type: string, uuid: string) => `${CATALOG_ROUTE}/${type}/${uuid}/tags`,
} as const;
