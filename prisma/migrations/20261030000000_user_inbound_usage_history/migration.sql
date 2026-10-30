-- Store user usage once per (user, node, inbound, hour) instead of once per
-- Host attached to that inbound. hosts_usage_history already records which
-- Hosts were attached to an inbound in every hour, so the per-Host rows are
-- rebuilt by the user_hosts_usage_history view below and existing queries
-- keep working unchanged.
CREATE TABLE "user_inbound_usage_history"
(
    "user_id"        BIGINT    NOT NULL,
    "node_uuid"      UUID      NOT NULL,
    "inbound_tag"    TEXT      NOT NULL,
    "download_bytes" BIGINT    NOT NULL,
    "upload_bytes"   BIGINT    NOT NULL,
    "total_bytes"    BIGINT    NOT NULL,
    "created_at"     TIMESTAMP NOT NULL DEFAULT date_trunc('hour', now()),
    "updated_at"     TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT "user_inbound_usage_history_pkey" PRIMARY KEY ("user_id", "node_uuid", "inbound_tag", "created_at")
);

ALTER TABLE "user_inbound_usage_history"
    ADD CONSTRAINT "user_inbound_usage_history_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_inbound_usage_history"
    ADD CONSTRAINT "user_inbound_usage_history_node_uuid_fkey"
        FOREIGN KEY ("node_uuid") REFERENCES "nodes" ("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- Older usage collection wrote user and inbound usage in separate jobs, so a
-- user row may have no Host row for the same hour. Add zero-byte Host rows so
-- the view below still finds them; zero bytes do not change any sum.
INSERT INTO "hosts_usage_history" (
    "host_uuid", "node_uuid", "inbound_tag", "download_bytes", "upload_bytes",
    "total_bytes", "is_shared", "created_at"
)
SELECT "host_uuid", "node_uuid", "inbound_tag", 0, 0, 0, bool_or("is_shared"), "created_at"
FROM "user_hosts_usage_history"
GROUP BY "host_uuid", "node_uuid", "inbound_tag", "created_at"
ON CONFLICT DO NOTHING;

-- Every Host row of a shared inbound received the same increments, so MAX
-- keeps one copy. A Host attached mid-hour has fewer bytes, never more.
INSERT INTO "user_inbound_usage_history" (
    "user_id", "node_uuid", "inbound_tag", "download_bytes", "upload_bytes",
    "total_bytes", "created_at", "updated_at"
)
SELECT "user_id", "node_uuid", "inbound_tag", MAX("download_bytes"), MAX("upload_bytes"),
       MAX("total_bytes"), "created_at", MAX("updated_at")
FROM "user_hosts_usage_history"
GROUP BY "user_id", "node_uuid", "inbound_tag", "created_at";

CREATE INDEX "user_inbound_usage_history_user_id_created_at_idx"
    ON "user_inbound_usage_history" ("user_id", "created_at" DESC);

CREATE INDEX "user_inbound_usage_history_node_uuid_inbound_tag_created_at_idx"
    ON "user_inbound_usage_history" ("node_uuid", "inbound_tag", "created_at" DESC);

DROP TABLE "user_hosts_usage_history";

CREATE VIEW "user_hosts_usage_history" AS
SELECT u."user_id",
       h."host_uuid",
       u."node_uuid",
       u."inbound_tag",
       u."download_bytes",
       u."upload_bytes",
       u."total_bytes",
       h."is_shared",
       u."created_at",
       u."updated_at"
FROM "user_inbound_usage_history" u
JOIN "hosts_usage_history" h
  ON h."node_uuid" = u."node_uuid"
 AND h."inbound_tag" = u."inbound_tag"
 AND h."created_at" = u."created_at";
