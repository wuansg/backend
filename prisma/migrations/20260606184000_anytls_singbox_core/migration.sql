ALTER TABLE "config_profiles"
    ADD COLUMN "core_type" VARCHAR(16) NOT NULL DEFAULT 'XRAY';

ALTER TABLE "users"
    ADD COLUMN "anytls_password" TEXT NOT NULL DEFAULT (gen_random_uuid()::text);

