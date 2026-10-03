/** Keep existing configuration files loadable without accepting arbitrary unknown events. */
export function stripRetiredNotificationEvents(value: unknown): unknown {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    const events = { ...value } as Record<string, unknown>;
    delete events['torrent_blocker.report'];
    return events;
}
