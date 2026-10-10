CREATE TABLE offline_exports (
  sequence bigserial PRIMARY KEY,
  id uuid UNIQUE NOT NULL,
  target_id uuid NOT NULL,
  package_ids uuid[] NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES (3);
