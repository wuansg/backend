ALTER TABLE "nodes"
ADD COLUMN "forwarding_config" JSONB NOT NULL
DEFAULT '{"enabled":false,"listenInterface":"auto","rules":[]}'::jsonb;
