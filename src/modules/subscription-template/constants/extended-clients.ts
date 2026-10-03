export const EXTENDED_CLIENTS_REGEXES = [
    /^FlClash ?X\//,
    /^Flowvy\//,
    /^prizrak-box\//,
    /^koala-clash\//,
    /^Happ\//,
    /^INCY\//,
] as const;

export function isExtendedClient(userAgent: string): boolean {
    return EXTENDED_CLIENTS_REGEXES.some((client) => client.test(userAgent));
}
