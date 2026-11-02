-- ZenOS Control Center V1 — base administrativa independente (PostgreSQL).
-- NÃO executar no banco operacional de clientes nem no Firebase.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text NOT NULL UNIQUE CHECK (length(trim(firebase_uid)) > 0),
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  country char(2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS plan_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id),
  currency char(3) NOT NULL CHECK (currency IN ('BRL','PYG','USD','EUR')),
  amount numeric(18,4) NOT NULL CHECK (amount >= 0),
  billing_interval text NOT NULL CHECK (billing_interval IN ('monthly','yearly','custom')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE TABLE IF NOT EXISTS plan_modules (
  plan_id uuid NOT NULL REFERENCES plans(id),
  module_id uuid NOT NULL REFERENCES modules(id),
  PRIMARY KEY(plan_id,module_id)
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  plan_id uuid NOT NULL REFERENCES plans(id),
  status text NOT NULL CHECK(status IN ('trial','active','past_due','grace','suspended','canceled')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions (organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS trial_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  source text NOT NULL,
  CHECK (expires_at > started_at)
);
CREATE INDEX IF NOT EXISTS idx_trial_org ON trial_periods(organization_id,expires_at DESC);
CREATE TABLE IF NOT EXISTS entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  module_id uuid NOT NULL REFERENCES modules(id),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  CHECK(valid_until IS NULL OR valid_until > valid_from)
);
CREATE INDEX IF NOT EXISTS idx_entitlements_org ON entitlements(organization_id,module_id);
CREATE TABLE IF NOT EXISTS commercial_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  request_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','approved','rejected','canceled')),
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_requests_org_status ON commercial_requests(organization_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  currency char(3) NOT NULL CHECK(currency IN ('BRL','PYG','USD','EUR')),
  total numeric(18,4) NOT NULL CHECK(total >= 0),
  due_at timestamptz NOT NULL,
  status text NOT NULL CHECK(status IN ('draft','issued','partial','paid','void','overdue')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(status,due_at);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  currency char(3) NOT NULL CHECK(currency IN ('BRL','PYG','USD','EUR')),
  amount numeric(18,4) NOT NULL CHECK(amount > 0),
  status text NOT NULL CHECK(status IN ('pending','confirmed','reversed','refunded')),
  provider text NOT NULL,
  provider_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_reference)
);
CREATE TABLE IF NOT EXISTS inbox_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  organization_uid text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(next_attempt_at) WHERE delivered_at IS NULL;
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_subject text NOT NULL UNIQUE,
  email text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_roles (
  admin_id uuid NOT NULL REFERENCES admin_users(id),
  role text NOT NULL CHECK(role IN ('owner','billing','support','auditor')),
  PRIMARY KEY(admin_id,role)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id uuid REFERENCES admin_users(id),
  organization_id uuid REFERENCES organizations(id),
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_events(organization_id,occurred_at DESC);
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  type text NOT NULL,
  title text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(created_at DESC) WHERE read_at IS NULL;
COMMIT;
