#!/usr/bin/env bash
# Controlled one-off migration in an isolated Control Center PostgreSQL.
set -euo pipefail
: "${CONTROL_CENTER_DATABASE_URL:?Provide a secure isolated database URL via environment secrets}"
if [[ "${CONTROL_CENTER_MIGRATION_APPROVED:-}" != "homologacao" ]]; then
  echo 'BLOCKED: set CONTROL_CENTER_MIGRATION_APPROVED=homologacao only after reviewing the target DB.' >&2
  exit 2
fi
case "${CONTROL_CENTER_DATABASE_URL}" in
  postgres://*|postgresql://*) ;;
  *) echo 'BLOCKED: invalid postgres URL' >&2; exit 2 ;;
esac
echo 'Control Center homologation migration starting (credentials hidden).'
psql "${CONTROL_CENTER_DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "$(dirname "$0")/../migrations/001_foundation.sql"
psql "${CONTROL_CENTER_DATABASE_URL}" -X -v ON_ERROR_STOP=1 -Atqc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('organizations','subscriptions','invoices','payments','inbox_events','outbox_events','admin_users','audit_events')"
echo 'Migration command finished. Verify table count above equals 8 and review post-migration results.'
