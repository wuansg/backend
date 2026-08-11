CREATE TABLE "node_usage_snapshot_state" (
    "node_uuid" UUID NOT NULL,
    "generation" TEXT NOT NULL,
    "received_through" BIGINT NOT NULL DEFAULT 0,
    "applied_through" BIGINT NOT NULL DEFAULT 0,
    "pending" INTEGER NOT NULL DEFAULT 0,
    "node_queue_bytes" BIGINT NOT NULL DEFAULT 0,
    "last_captured_at" TIMESTAMP(3),
    "last_error" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "node_usage_snapshot_state_pkey" PRIMARY KEY ("node_uuid")
);

CREATE TABLE "node_usage_snapshot_inbox" (
    "node_uuid" UUID NOT NULL,
    "generation" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "core" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "applied_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "node_usage_snapshot_inbox_pkey" PRIMARY KEY ("node_uuid", "generation", "sequence")
);

CREATE INDEX "node_usage_snapshot_inbox_node_uuid_applied_at_sequence_idx"
ON "node_usage_snapshot_inbox"("node_uuid", "applied_at", "sequence");

ALTER TABLE "node_usage_snapshot_state" ADD CONSTRAINT "node_usage_snapshot_state_node_uuid_fkey"
FOREIGN KEY ("node_uuid") REFERENCES "nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "node_usage_snapshot_inbox" ADD CONSTRAINT "node_usage_snapshot_inbox_node_uuid_fkey"
FOREIGN KEY ("node_uuid") REFERENCES "nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
