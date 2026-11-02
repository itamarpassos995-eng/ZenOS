-- Control Center homologation only. Execute after 002, never automatically.
BEGIN;
ALTER TABLE admin_mfa_state ADD COLUMN IF NOT EXISTS secret_cipher text;
ALTER TABLE admin_mfa_state ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS admin_oauth_attempts (
 state_hash text PRIMARY KEY, browser_hash text NOT NULL, payload_cipher text NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_auth_challenges (
 token_hash text PRIMARY KEY, admin_id uuid NOT NULL REFERENCES admin_users(id),
 csrf_hash text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_sessions (
 token_hash text PRIMARY KEY, admin_id uuid NOT NULL REFERENCES admin_users(id),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);
COMMIT;
