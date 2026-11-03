-- Somente homologação. Não repete a fundação nem toca no Firebase.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 7 CHECK(trial_days BETWEEN 0 AND 365);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS currency char(3) CHECK(currency IN ('BRL','PYG','USD','EUR'));
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS recurring_amount numeric(18,4) CHECK(recurring_amount>=0);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_day integer CHECK(billing_day BETWEEN 1 AND 28);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_days integer NOT NULL DEFAULT 0 CHECK(grace_days BETWEEN 0 AND 90);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES subscriptions(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_key text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount numeric(18,4) NOT NULL DEFAULT 0 CHECK(discount>=0 AND discount<=total);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_period ON invoices(subscription_id,period_key);
CREATE TABLE IF NOT EXISTS administrative_commands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 actor_id uuid NOT NULL REFERENCES admin_users(id), idempotency_key text NOT NULL UNIQUE,
 request_hash text NOT NULL, command_type text NOT NULL, reason text NOT NULL,
 expected_revision integer NOT NULL, payload jsonb NOT NULL, state text NOT NULL DEFAULT 'pending'
 CHECK(state IN ('pending','processing','applied','failed')), attempts integer NOT NULL DEFAULT 0,
 last_error text, created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz,
 outbox_id uuid REFERENCES outbox_events(id)
);
CREATE TABLE IF NOT EXISTS administrative_receipts (
 idempotency_key text PRIMARY KEY, actor_id uuid NOT NULL REFERENCES admin_users(id),
 request_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS organization_access (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id), desired_state text NOT NULL DEFAULT 'allowed'
 CHECK(desired_state IN ('allowed','restricted','suspended')),
 applied_state text CHECK(applied_state IN ('allowed','restricted','suspended')),
 revision integer NOT NULL DEFAULT 0, applied_revision integer NOT NULL DEFAULT 0,
 last_command_id uuid REFERENCES administrative_commands(id)
);
CREATE INDEX IF NOT EXISTS idx_commands_org ON administrative_commands(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_name ON organizations(lower(display_name),id);
