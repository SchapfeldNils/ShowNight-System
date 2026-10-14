CREATE TABLE scenes (
  id uuid PRIMARY KEY,
  show_id uuid NOT NULL REFERENCES shows(id),
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  definition jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scenes_show_idx ON scenes(show_id);
CREATE TABLE scene_leases (
  scene_id uuid PRIMARY KEY REFERENCES scenes(id),
  session_hash text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL
);
INSERT INTO schema_migrations(version) VALUES (4);
