ALTER TABLE user_access_audit_policy ADD COLUMN enabled_until timestamptz(3);
CREATE INDEX user_access_audit_policy_expiry_idx ON user_access_audit_policy (enabled_until) WHERE enabled = true AND enabled_until IS NOT NULL;
