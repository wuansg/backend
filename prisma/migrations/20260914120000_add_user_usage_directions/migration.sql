ALTER TABLE "user_traffic"
    ADD COLUMN "used_upload_traffic_bytes" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "used_download_traffic_bytes" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "lifetime_upload_traffic_bytes" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "lifetime_download_traffic_bytes" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "nodes_user_usage_history"
    ADD COLUMN "upload_bytes" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "download_bytes" BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN "user_traffic"."used_upload_traffic_bytes" IS
    'Upload traffic collected after directional accounting was enabled.';
COMMENT ON COLUMN "user_traffic"."used_download_traffic_bytes" IS
    'Download traffic collected after directional accounting was enabled.';
COMMENT ON COLUMN "nodes_user_usage_history"."upload_bytes" IS
    'Upload traffic collected after directional accounting was enabled; historical rows remain zero.';
COMMENT ON COLUMN "nodes_user_usage_history"."download_bytes" IS
    'Download traffic collected after directional accounting was enabled; historical rows remain zero.';
