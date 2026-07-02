CREATE TABLE "hosts_usage_history"
(
    "host_uuid"      UUID                     NOT NULL,
    "node_uuid"      UUID                     NOT NULL,
    "inbound_tag"    TEXT                     NOT NULL,
    "download_bytes" BIGINT                   NOT NULL,
    "upload_bytes"   BIGINT                   NOT NULL,
    "total_bytes"    BIGINT                   NOT NULL,
    "is_shared"      BOOLEAN                  NOT NULL DEFAULT false,
    "created_at"     TIMESTAMP(3)             NOT NULL DEFAULT date_trunc('hour', now()),
    "updated_at"     TIMESTAMP(3)             NOT NULL DEFAULT now(),

    CONSTRAINT "hosts_usage_history_pkey" PRIMARY KEY ("host_uuid", "node_uuid", "inbound_tag", "created_at")
);

CREATE INDEX "hosts_usage_history_host_uuid_created_at_idx"
    ON "hosts_usage_history" ("host_uuid", "created_at" DESC);

CREATE INDEX "hosts_usage_history_node_uuid_inbound_tag_created_at_idx"
    ON "hosts_usage_history" ("node_uuid", "inbound_tag", "created_at" DESC);

ALTER TABLE "hosts_usage_history"
    ADD CONSTRAINT "hosts_usage_history_host_uuid_fkey"
        FOREIGN KEY ("host_uuid") REFERENCES "hosts" ("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hosts_usage_history"
    ADD CONSTRAINT "hosts_usage_history_node_uuid_fkey"
        FOREIGN KEY ("node_uuid") REFERENCES "nodes" ("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
