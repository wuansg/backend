ALTER TABLE "nodes"
    ADD COLUMN "expected_agent_version" VARCHAR(32),
    ADD COLUMN "expected_agent_image_tag" VARCHAR(128),
    ADD COLUMN "rollout_batch" VARCHAR(64),
    ADD COLUMN "node_api_sni_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "node_api_sni_last_success_at" TIMESTAMP(3);

CREATE TABLE "node_runtime_inventory" (
    "node_uuid" UUID NOT NULL,
    "agent_version" VARCHAR(32) NOT NULL,
    "sing_box_version" VARCHAR(32),
    "architecture" VARCHAR(32),
    "runtime_mode" VARCHAR(32) NOT NULL,
    "running_core" VARCHAR(32),
    "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "supported_cores" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "runtime_status" JSONB NOT NULL DEFAULT '{}',
    "config_hashes" JSONB NOT NULL DEFAULT '{}',
    "plugin_hash" VARCHAR(64),
    "forwarding_hash" VARCHAR(64),
    "reported_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "node_runtime_inventory_pkey" PRIMARY KEY ("node_uuid")
);

CREATE INDEX "node_runtime_inventory_agent_version_idx"
    ON "node_runtime_inventory"("agent_version");
CREATE INDEX "node_runtime_inventory_architecture_idx"
    ON "node_runtime_inventory"("architecture");
CREATE INDEX "node_runtime_inventory_runtime_mode_idx"
    ON "node_runtime_inventory"("runtime_mode");
CREATE INDEX "node_runtime_inventory_reported_at_idx"
    ON "node_runtime_inventory"("reported_at");

ALTER TABLE "node_runtime_inventory"
    ADD CONSTRAINT "node_runtime_inventory_node_uuid_fkey"
    FOREIGN KEY ("node_uuid") REFERENCES "nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
