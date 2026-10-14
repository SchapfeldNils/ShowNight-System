CREATE TABLE agent_pairings (
  code_hash text PRIMARY KEY, name text NOT NULL, profile text NOT NULL CHECK(profile IN ('dj','light','main')),
  created_by uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL,
  consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agent_devices (
  id uuid PRIMARY KEY, name text NOT NULL, profile text NOT NULL CHECK(profile IN ('dj','light','main')),
  token_hash text UNIQUE NOT NULL, paired_by uuid NOT NULL REFERENCES users(id),
  revoked_at timestamptz, last_seen timestamptz, connection_id uuid, agent_version text,
  capabilities jsonb NOT NULL DEFAULT '[]', online boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agent_dispatches (
  id uuid PRIMARY KEY, device_id uuid NOT NULL REFERENCES agent_devices(id),
  connection_id uuid NOT NULL, action text NOT NULL CHECK(action IN ('diagnostics.ping','simulator.noop')),
  created_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK(status IN ('sent','accepted','completed','failed','unknown')),
  evidence text, observed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_dispatch_device ON agent_dispatches(device_id,created_at DESC);
INSERT INTO schema_migrations(version) VALUES (2);
