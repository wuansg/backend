CREATE TABLE "node_forwarding_usage_history" (
    "node_uuid" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "protocol" VARCHAR(3) NOT NULL,
    "upload_bytes" BIGINT NOT NULL DEFAULT 0,
    "download_bytes" BIGINT NOT NULL DEFAULT 0,
    "total_bytes" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_forwarding_usage_history_pkey"
        PRIMARY KEY ("node_uuid", "rule_id", "protocol", "created_at"),
    CONSTRAINT "node_forwarding_usage_history_node_uuid_fkey"
        FOREIGN KEY ("node_uuid") REFERENCES "nodes"("uuid")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "node_forwarding_usage_history_protocol_check"
        CHECK ("protocol" IN ('TCP', 'UDP')),
    CONSTRAINT "node_forwarding_usage_history_nonnegative_check"
        CHECK ("upload_bytes" >= 0 AND "download_bytes" >= 0 AND "total_bytes" >= 0),
    CONSTRAINT "node_forwarding_usage_history_total_check"
        CHECK ("total_bytes" = "upload_bytes" + "download_bytes")
);

CREATE INDEX "node_forwarding_usage_history_node_uuid_created_at_idx"
    ON "node_forwarding_usage_history"("node_uuid", "created_at");

CREATE INDEX "node_forwarding_usage_history_node_uuid_rule_id_created_at_idx"
    ON "node_forwarding_usage_history"("node_uuid", "rule_id", "created_at");
