ALTER TABLE users ADD COLUMN email text;
ALTER TABLE users ADD COLUMN pending_email text;
CREATE UNIQUE INDEX users_confirmed_email ON users(email) WHERE email IS NOT NULL;
CREATE TABLE account_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('confirm','reset')),
  email text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX account_tokens_user_kind ON account_tokens(user_id,kind);
ALTER TABLE mail_jobs ADD COLUMN body_html text;
INSERT INTO schema_migrations(version) VALUES (6);
