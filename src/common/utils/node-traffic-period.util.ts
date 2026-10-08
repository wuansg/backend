/** Match the existing monthly reset task: 01:00 in the panel process timezone. */
export function getLegacyNodeTrafficPeriodStart(
    node: { createdAt: Date; isTrafficTrackingActive: boolean; trafficResetDay: number | null },
    now = new Date(),
): Date {
    if (!node.isTrafficTrackingActive) return new Date(node.createdAt);

    const resetDay = Math.min(31, Math.max(1, node.trafficResetDay || 1));
    const resetInMonth = (year: number, month: number) =>
        new Date(year, month, Math.min(resetDay, new Date(year, month + 1, 0).getDate()), 1);
    let resetAt = resetInMonth(now.getFullYear(), now.getMonth());
    if (resetAt > now) resetAt = resetInMonth(now.getFullYear(), now.getMonth() - 1);

    return new Date(Math.max(node.createdAt.getTime(), resetAt.getTime()));
}

/** Legacy forwarding history is hourly; include the node's first partial hour. */
export function getNodeTrafficHistoryStart(periodStart: Date): Date {
    const hour = new Date(periodStart);
    hour.setUTCMinutes(0, 0, 0);
    return hour;
}
