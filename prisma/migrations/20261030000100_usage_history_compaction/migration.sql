-- user_inbound_usage_history older than the retention window is folded from
-- hourly into daily rows; hosts_usage_history gets a zero-byte midnight row per
-- Host seen that day so the user_hosts_usage_history view still joins. BRIN
-- indexes let the job find one day cheaply and are nearly free to maintain on
-- these append-mostly tables.
CREATE INDEX "hosts_usage_history_created_at_brin_idx"
    ON "hosts_usage_history" USING BRIN ("created_at");

CREATE INDEX "user_inbound_usage_history_created_at_brin_idx"
    ON "user_inbound_usage_history" USING BRIN ("created_at");

-- Days before compacted_before (UTC) only hold daily user inbound rows.
CREATE TABLE "usage_history_compaction_state"
(
    "id"               INTEGER   NOT NULL DEFAULT 1,
    "compacted_before" DATE,
    "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT "usage_history_compaction_state_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "usage_history_compaction_state_singleton" CHECK ("id" = 1)
);

INSERT INTO "usage_history_compaction_state" ("id") VALUES (1);
