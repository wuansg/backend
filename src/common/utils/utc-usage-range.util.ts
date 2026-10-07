import { Prisma } from '@prisma/client';
import { sql } from 'kysely';

// Usage history stores UTC in timestamp-without-time-zone or DATE columns.
// Prisma binds Date parameters as timestamptz; an implicit cast uses the DB session timezone.
export const getUtcUsageTimestampSql = (date: Date) =>
    Prisma.sql`(${date}::timestamptz AT TIME ZONE 'UTC')`;
export const getUtcUsageDateSql = (date: Date) =>
    Prisma.sql`${date.toISOString().slice(0, 10)}::date`;
export const getUtcUsageTimestampExpression = (date: Date) =>
    sql<Date>`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
export const getUtcUsageDateExpression = (date: Date) =>
    sql<Date>`${date.toISOString().slice(0, 10)}::date`;
