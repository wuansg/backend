ALTER TABLE "nodes"
    ADD COLUMN "geocheck_interval_minutes" INTEGER,
    ADD COLUMN "geocheck_source" JSONB,
    ADD COLUMN "geocheck_cooldown_minutes" INTEGER NOT NULL DEFAULT 60,
    ADD COLUMN "last_geocheck_scheduled_at" TIMESTAMP(3);

ALTER TABLE "config_profiles" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "node_plugin" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "subscription_templates" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "subscription_page_config" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "internal_squads" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "external_squads" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "nodes_tags_idx" ON "nodes" USING GIN ("tags");
CREATE INDEX "hosts_tags_idx" ON "hosts" USING GIN ("tags");
CREATE INDEX "config_profiles_tags_idx" ON "config_profiles" USING GIN ("tags");
CREATE INDEX "node_plugin_tags_idx" ON "node_plugin" USING GIN ("tags");
CREATE INDEX "subscription_templates_tags_idx" ON "subscription_templates" USING GIN ("tags");
CREATE INDEX "subscription_page_config_tags_idx" ON "subscription_page_config" USING GIN ("tags");
CREATE INDEX "internal_squads_tags_idx" ON "internal_squads" USING GIN ("tags");
CREATE INDEX "external_squads_tags_idx" ON "external_squads" USING GIN ("tags");

CREATE TABLE "node_plugin_deployments" (
    "node_uuid" UUID NOT NULL,
    "plugin_uuid" UUID,
    "desired_hash" VARCHAR(64) NOT NULL DEFAULT '',
    "applied_hash" VARCHAR(64) NOT NULL DEFAULT '',
    "state" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "last_error" VARCHAR(2000),
    "resolution_state" JSONB NOT NULL DEFAULT '{}',
    "last_attempt_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolled_back" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "node_plugin_deployments_pkey" PRIMARY KEY ("node_uuid")
);

CREATE INDEX "node_plugin_deployments_plugin_uuid_idx" ON "node_plugin_deployments"("plugin_uuid");
CREATE INDEX "node_plugin_deployments_state_idx" ON "node_plugin_deployments"("state");

CREATE TABLE "node_network_inventory" (
    "node_uuid" UUID NOT NULL,
    "interfaces" JSONB NOT NULL DEFAULT '[]',
    "reported_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "node_network_inventory_pkey" PRIMARY KEY ("node_uuid")
);

CREATE TABLE "node_geocheck_history" (
    "id" BIGSERIAL NOT NULL,
    "node_uuid" UUID NOT NULL,
    "source_type" VARCHAR(16) NOT NULL,
    "source_value" VARCHAR(255),
    "success" BOOLEAN NOT NULL,
    "report" JSONB,
    "snapshot" JSONB,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "message" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "node_geocheck_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "node_geocheck_history_node_uuid_created_at_idx"
    ON "node_geocheck_history"("node_uuid", "created_at" DESC);

CREATE TABLE "node_geocheck_drift_events" (
    "id" BIGSERIAL NOT NULL,
    "node_uuid" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "previous_value" VARCHAR(255),
    "current_value" VARCHAR(255),
    "acknowledged_at" TIMESTAMP(3),
    "notification_due" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "node_geocheck_drift_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "node_geocheck_drift_events_node_uuid_created_at_idx"
    ON "node_geocheck_drift_events"("node_uuid", "created_at" DESC);
CREATE INDEX "node_geocheck_drift_events_acknowledged_at_idx"
    ON "node_geocheck_drift_events"("acknowledged_at");

ALTER TABLE "node_plugin_deployments"
    ADD CONSTRAINT "node_plugin_deployments_node_uuid_fkey"
    FOREIGN KEY ("node_uuid") REFERENCES "nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "node_plugin_deployments"
    ADD CONSTRAINT "node_plugin_deployments_plugin_uuid_fkey"
    FOREIGN KEY ("plugin_uuid") REFERENCES "node_plugin"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "node_network_inventory"
    ADD CONSTRAINT "node_network_inventory_node_uuid_fkey"
    FOREIGN KEY ("node_uuid") REFERENCES "nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "node_geocheck_history"
    ADD CONSTRAINT "node_geocheck_history_node_uuid_fkey"
    FOREIGN KEY ("node_uuid") REFERENCES "nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "node_geocheck_drift_events"
    ADD CONSTRAINT "node_geocheck_drift_events_node_uuid_fkey"
    FOREIGN KEY ("node_uuid") REFERENCES "nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
