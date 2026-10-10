-- Entirely additive; no existing user is opted in.
CREATE TABLE access_audit_settings (id INTEGER PRIMARY KEY DEFAULT 1, revision BIGINT NOT NULL DEFAULT 0, targets_hash TEXT NOT NULL DEFAULT '', CONSTRAINT audit_settings_singleton CHECK (id = 1));
INSERT INTO access_audit_settings(id) VALUES (1);
CREATE TABLE user_access_audit_policy (
 user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 enabled BOOLEAN NOT NULL DEFAULT false, retention_days INTEGER NOT NULL DEFAULT 7 CHECK(retention_days BETWEEN 1 AND 30),
 window_id UUID, enabled_at TIMESTAMPTZ(3), updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 CHECK(NOT enabled OR (window_id IS NOT NULL AND enabled_at IS NOT NULL))
);
CREATE TABLE user_access_audit_records (
 id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 node_uuid UUID NOT NULL REFERENCES nodes(uuid) ON DELETE CASCADE, window_id UUID NOT NULL, connection_id UUID NOT NULL,
 domain VARCHAR(253) NOT NULL, destination_ip VARCHAR(45) NOT NULL, destination_port INTEGER NOT NULL CHECK(destination_port BETWEEN 0 AND 65535),
 inbound VARCHAR(128) NOT NULL, network VARCHAR(16) NOT NULL, protocol VARCHAR(32) NOT NULL,
 started_at TIMESTAMPTZ(3) NOT NULL, observed_at TIMESTAMPTZ(3) NOT NULL, expires_at TIMESTAMPTZ(3) NOT NULL, closed_at TIMESTAMPTZ(3),
 upload_bytes BIGINT NOT NULL CHECK(upload_bytes>=0), download_bytes BIGINT NOT NULL CHECK(download_bytes>=0), partial BOOLEAN NOT NULL DEFAULT false,
 UNIQUE(node_uuid,window_id,connection_id)
);
CREATE INDEX user_access_audit_records_user_id_observed_at_idx ON user_access_audit_records(user_id,observed_at);
CREATE INDEX user_access_audit_records_observed_at_idx ON user_access_audit_records(observed_at);
CREATE INDEX user_access_audit_records_expires_at_idx ON user_access_audit_records(expires_at);
CREATE TABLE node_access_audit_state (
 node_uuid UUID PRIMARY KEY REFERENCES nodes(uuid) ON DELETE CASCADE, lease_owner UUID, lease_until TIMESTAMPTZ(3),
 synced_at TIMESTAMPTZ(3), last_error VARCHAR(256), status JSONB NOT NULL DEFAULT '{}'
);
