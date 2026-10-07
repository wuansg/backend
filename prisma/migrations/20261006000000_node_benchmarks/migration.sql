CREATE TABLE "node_benchmarks" (
 "id" UUID PRIMARY KEY, "node_uuid" UUID NOT NULL REFERENCES "nodes"("uuid") ON DELETE CASCADE,
 "kind" VARCHAR(16) NOT NULL, "status" VARCHAR(24) NOT NULL, "request" JSONB NOT NULL,
 "result" JSONB NOT NULL DEFAULT '{}', "message" VARCHAR(512), "lease_owner" UUID,
 "lease_until" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL, "finished_at" TIMESTAMP(3), "started_at" TIMESTAMP(3)
);
CREATE INDEX "node_benchmarks_node_uuid_created_at_idx" ON "node_benchmarks"("node_uuid", "created_at" DESC);
CREATE INDEX "node_benchmarks_status_lease_until_idx" ON "node_benchmarks"("status", "lease_until");
CREATE UNIQUE INDEX "node_benchmarks_one_active_per_node" ON "node_benchmarks"("node_uuid") WHERE "status" IN ('QUEUED','RUNNING','CANCEL_REQUESTED');
CREATE TABLE "benchmark_targets" ("id" VARCHAR(64) PRIMARY KEY, "config" JSONB NOT NULL, "updated_at" TIMESTAMP(3) NOT NULL);
