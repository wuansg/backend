ALTER TABLE "node_usage_snapshot_state"
ADD COLUMN "capturing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ingest_successes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "ingest_failures" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "database_retries" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "last_success_at" TIMESTAMP(3),
ADD COLUMN "last_duration_ms" INTEGER;
