CREATE TABLE timer_preparations (
  show_id uuid PRIMARY KEY REFERENCES shows(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  preset jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES (7);
