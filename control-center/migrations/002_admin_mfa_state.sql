-- Homologation only. Not executed automatically. Contains no TOTP secrets.
BEGIN;
CREATE TABLE IF NOT EXISTS admin_mfa_state (
  admin_id uuid PRIMARY KEY REFERENCES admin_users(id),
  last_counter bigint NOT NULL DEFAULT -1,
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  locked_until timestamptz
);
COMMIT;
