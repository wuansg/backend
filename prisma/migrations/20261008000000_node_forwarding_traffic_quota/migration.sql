-- Existing nodes remain NULL for a one-time backfill under the ingestion lock.
-- Set the default separately so new nodes start at creation, without backfill.
ALTER TABLE "nodes" ADD COLUMN "traffic_usage_started_at" TIMESTAMPTZ(3);
ALTER TABLE "nodes" ALTER COLUMN "traffic_usage_started_at" SET DEFAULT CURRENT_TIMESTAMP;
