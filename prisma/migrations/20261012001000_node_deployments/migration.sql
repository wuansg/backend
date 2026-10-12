CREATE TABLE node_config_state (
  node_uuid uuid PRIMARY KEY REFERENCES nodes(uuid) ON DELETE CASCADE,
  requested_seq bigint NOT NULL DEFAULT 0, processed_seq bigint NOT NULL DEFAULT 0,
  requested_at timestamptz(3) NOT NULL DEFAULT now(), due_at timestamptz(3) NOT NULL DEFAULT now(),
  reason varchar(64) NOT NULL DEFAULT 'CONFIG_APPLY', actor_uuid uuid, force boolean NOT NULL DEFAULT false,
  pinned_revision_uuid uuid, previous_pinned_revision_uuid uuid, blocked boolean NOT NULL DEFAULT false, applied_revision_uuid uuid, batch_uuid uuid,
  lease_owner uuid, lease_until timestamptz(3), attempts integer NOT NULL DEFAULT 0, last_error varchar(64)
);
CREATE TABLE node_config_revisions (
  uuid uuid PRIMARY KEY, node_uuid uuid NOT NULL REFERENCES nodes(uuid) ON DELETE CASCADE,
  profile_uuid uuid NOT NULL, template_hash varchar(64) NOT NULL, encrypted_snapshot text NOT NULL,
  inbound_tags text[] NOT NULL, changed_sections text[] NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE (node_uuid, profile_uuid, template_hash)
);
CREATE INDEX node_config_revisions_node_created_idx ON node_config_revisions (node_uuid, created_at);
CREATE TABLE node_config_deployments (
  uuid uuid PRIMARY KEY, node_uuid uuid NOT NULL REFERENCES nodes(uuid) ON DELETE CASCADE,
  revision_uuid uuid REFERENCES node_config_revisions(uuid) ON DELETE SET NULL,
  batch_uuid uuid, request_seq bigint NOT NULL, actor_uuid uuid, reason varchar(64) NOT NULL,
  state varchar(32) NOT NULL DEFAULT 'APPLYING', requested_hash varchar(64), active_hash varchar(64), error_code varchar(64), rollback varchar(32),
  started_at timestamptz(3) NOT NULL DEFAULT now(), finished_at timestamptz(3), duration_ms integer
);
CREATE INDEX node_config_deployments_node_started_idx ON node_config_deployments (node_uuid, started_at);
CREATE INDEX node_config_deployments_batch_started_idx ON node_config_deployments (batch_uuid, started_at);
CREATE TABLE node_config_batches (
  uuid uuid PRIMARY KEY, profile_uuid uuid NOT NULL, source_hash varchar(64) NOT NULL, node_uuids uuid[] NOT NULL, revision_uuids uuid[] NOT NULL,
  actor_uuid uuid, state varchar(32) NOT NULL DEFAULT 'PENDING', next_index integer NOT NULL DEFAULT 0,
  active_node_uuid uuid, active_request_seq bigint, lease_owner uuid, lease_until timestamptz(3), error_code varchar(64),
  created_at timestamptz(3) NOT NULL DEFAULT now(), finished_at timestamptz(3)
);
