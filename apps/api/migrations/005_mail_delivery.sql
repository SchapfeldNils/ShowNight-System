-- Every existing S1 job was a test job. Never promote it through configuration.
ALTER TABLE mail_jobs ADD COLUMN delivery_mode text NOT NULL DEFAULT 'test'
  CHECK (delivery_mode IN ('test', 'smtp'));
INSERT INTO schema_migrations(version) VALUES (5);
