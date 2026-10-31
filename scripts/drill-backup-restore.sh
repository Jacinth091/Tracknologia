#!/usr/bin/env bash
# scripts/drill-backup-restore.sh
#
# CI restore drill for the manual backup routine in docs/OPERATIONS.md
# ("Manual backups (free plan)"). It proves that a `supabase db dump --local`
# can be restored with its rows, RLS, grants, migration history and operator
# access intact.
#
# It runs only on the disposable local Supabase stack that the Database
# integration job starts. It is destructive there by design: it wipes the
# public schema and every Auth table before restoring them from the dump.
#
#  1. Refuses any API host other than 127.0.0.1 or localhost, and requires
#     DRILL_DISPOSABLE=1 so a developer's shared local stack is never wiped.
#  2. Seeds a fixed fixture (own fixed UUIDs): auth users, a Provider with an
#     OWNER membership, an accepted Repair Request, a Repair with status
#     history, a Feedback submission with a review event, and an internal
#     operator mapping.
#  3. Dumps roles (--role-only), schema, and data (--data-only --use-copy,
#     including the migration history) with `supabase db dump --local`.
#  4. Wipes the restored scope in place: drops and recreates public with
#     Supabase's default grants, then truncates every table in the auth schema
#     (except schema_migrations, which the dump excludes) and every table in
#     the supabase_migrations schema. This matches a fresh project's empty
#     Auth and migration-history schemas.
#  5. Restores with psql --single-transaction -v ON_ERROR_STOP=1: schema, then
#     session_replication_role = replica, then data.
#  6. Verifies with SQL and fails on the first mismatch, then prints a summary.
#
# Dumps live only in a temporary directory that is deleted on exit.
#
# Usage:  pnpm drill:backup-restore
# Env:    SUPABASE_TEST_URL   local API URL; host must be 127.0.0.1 or localhost
#         DRILL_DISPOSABLE    must be 1 (CI sets it; never set it on a shared stack)
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

log() { printf '[drill] %s\n' "$*"; }
die() { printf '[drill] ERROR: %s\n' "$*" >&2; exit 1; }

api_url="${SUPABASE_TEST_URL:-}"
[ -n "$api_url" ] || die "SUPABASE_TEST_URL is not set"
api_host="$(sed -E 's#^[a-z]+://([^/:]+).*#\1#' <<< "$api_url")"
case "$api_host" in
  127.0.0.1|localhost) ;;
  *) die "refusing non-local host '$api_host' (allowed: 127.0.0.1, localhost)" ;;
esac
[ "${DRILL_DISPOSABLE:-}" = "1" ] \
  || die "set DRILL_DISPOSABLE=1 to confirm this is a disposable stack"
command -v supabase >/dev/null 2>&1 || die "supabase CLI is not on PATH"

project_id="$(sed -n 's/^project_id = "\([^"]*\)".*/\1/p' supabase/config.toml | head -n 1)"
[ -n "$project_id" ] || die "could not read project_id from supabase/config.toml"
db_container="supabase_db_${project_id}"
running_containers="$(docker ps --format '{{.Names}}')"
grep -Fxq -- "$db_container" <<< "$running_containers" \
  || die "database container $db_container is not running"

dump_dir="$(mktemp -d)"
trap 'rm -rf "$dump_dir"' EXIT

psql_query() {
  docker exec "$db_container" psql -X -q -t -A -v ON_ERROR_STOP=1 \
    -U postgres -d postgres -c "$1"
}

psql_stdin() {
  docker exec -i "$db_container" psql -X -q -t -A -v ON_ERROR_STOP=1 \
    -U postgres -d postgres
}

# Fixed fixture identities; interpolated into the verification SQL below.
owner_id=00000000-0000-4000-8000-00000000a001
operator_id=00000000-0000-4000-8000-00000000a002
provider_id=00000000-0000-4000-8000-00000000b001
request_id=00000000-0000-4000-8000-00000000c001
repair_id=00000000-0000-4000-8000-00000000c002
feedback_id=00000000-0000-4000-8000-00000000d001
feedback_nonce=00000000-0000-4000-8000-00000000d002

log "seeding fixture on $db_container"
psql_stdin <<SQL
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('$owner_id', 'authenticated', 'authenticated', 'drill-owner@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('$operator_id', 'authenticated', 'authenticated', 'drill-operator@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

INSERT INTO public.providers (id, display_name, slug)
VALUES ('$provider_id', 'Drill Provider', 'drill-provider');

INSERT INTO public.provider_user_profiles (user_id, display_name)
VALUES ('$owner_id', 'Drill Owner');

INSERT INTO public.provider_memberships (provider_id, user_id, role)
VALUES ('$provider_id', '$owner_id', 'OWNER');

INSERT INTO public.repair_requests (
  id, provider_id, reference_code, customer_name, customer_phone,
  device_type, reported_problem, status, accepted_at, accepted_by_user_id
)
VALUES (
  '$request_id', '$provider_id', 'REQ-0123456789ABCDEF', 'Drill Customer', '+63 900 000 0002',
  'Laptop', 'Drill reported problem', 'ACCEPTED', now(), '$owner_id'
);

INSERT INTO public.repairs (
  id, provider_id, repair_request_id, origin, ticket_number, tracking_code,
  customer_name, customer_phone, device_type, reported_problem, created_by_user_id
)
VALUES (
  '$repair_id', '$provider_id', '$request_id', 'CUSTOMER_REQUEST', 'TN-2026-ABCDEF0456',
  'TRK-0123456789ABCDEF00000456', 'Drill Customer', '+63 900 000 0002', 'Laptop',
  'Drill reported problem', '$owner_id'
);
INSERT INTO public.repair_status_events (repair_id, from_status, to_status, changed_by_user_id)
VALUES ('$repair_id', NULL, 'IN_PROGRESS', '$owner_id');
UPDATE public.repairs SET current_status = 'READY' WHERE id = '$repair_id';
INSERT INTO public.repair_status_events (repair_id, from_status, to_status, changed_by_user_id)
VALUES ('$repair_id', 'IN_PROGRESS', 'READY', '$owner_id');

INSERT INTO public.feedback_submissions (
  id, submission_nonce, category, source, participant_class, title, message
)
VALUES (
  '$feedback_id', '$feedback_nonce', 'BUG', 'PUBLIC_TRACKING',
  'PUBLIC_SELF_REPORTED_CUSTOMER', 'Drill feedback', 'Drill feedback message'
);

INSERT INTO public.internal_operators (user_id, enabled, provisioned_at, reason)
VALUES ('$operator_id', true, now(), 'drill fixture operator grant');

SELECT public.record_feedback_review(
  '$feedback_id', '$operator_id', 1, 'REVIEWING', 'HIGH', NULL, NULL, 'drill fixture review'
);
SQL

# Grant state of two sample RPCs and the table key grant, captured before the
# wipe so the restored state can be compared with it exactly.
grant_snapshot() {
  psql_query "SELECT concat_ws(',',
    has_function_privilege('anon', 'public.record_feedback_review(uuid,uuid,integer,text,text,text,text,text)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.record_feedback_review(uuid,uuid,integer,text,text,text,text,text)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.record_feedback_review(uuid,uuid,integer,text,text,text,text,text)', 'EXECUTE'),
    has_function_privilege('anon', 'public.change_internal_operator_access(uuid,uuid,boolean,text)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.change_internal_operator_access(uuid,uuid,boolean,text)', 'EXECUTE')
  );"
}
grants_before="$(grant_snapshot)"
log "grant snapshot before dump: $grants_before"

log "dumping roles, schema and data"
supabase db dump --local --role-only -f "$dump_dir/roles.sql"
supabase db dump --local -f "$dump_dir/schema.sql"
supabase db dump --local --data-only --use-copy \
  -s public,auth,supabase_migrations \
  -x auth.schema_migrations \
  -f "$dump_dir/data.sql"

log "wiping the restored scope in place"
psql_stdin <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
DO $$
DECLARE
  wiped_tables text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
    INTO wiped_tables
    FROM pg_tables
    WHERE (schemaname = 'auth' AND tablename <> 'schema_migrations')
       OR schemaname = 'supabase_migrations';
  IF wiped_tables IS NOT NULL THEN
    EXECUTE 'TRUNCATE ' || wiped_tables || ' CASCADE';
  END IF;
END
$$;
SQL

log "restoring: schema, then data with replica triggers"
{
  cat "$dump_dir/schema.sql"
  printf 'SET session_replication_role = replica;\n'
  cat "$dump_dir/data.sql"
} | docker exec -i "$db_container" psql -X -q -v ON_ERROR_STOP=1 \
  --single-transaction -U postgres -d postgres

verify() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" != "$expected" ]; then
    die "verification failed: $name (expected '$expected', got '$actual')"
  fi
  log "ok: $name"
}

verify "provider restored" "Drill Provider" \
  "$(psql_query "SELECT display_name FROM public.providers WHERE id = '$provider_id';")"
verify "OWNER membership restored" "OWNER" \
  "$(psql_query "SELECT role FROM public.provider_memberships WHERE provider_id = '$provider_id' AND user_id = '$owner_id';")"
verify "accepted request restored" "ACCEPTED|Drill Customer" \
  "$(psql_query "SELECT status || '|' || customer_name FROM public.repair_requests WHERE id = '$request_id';")"
verify "repair linked to request, status READY" "READY|$request_id" \
  "$(psql_query "SELECT current_status || '|' || repair_request_id FROM public.repairs WHERE id = '$repair_id';")"
verify "repair status history restored" "2" \
  "$(psql_query "SELECT count(*) FROM public.repair_status_events WHERE repair_id = '$repair_id';")"
verify "feedback restored with version 2" "REVIEWING|2" \
  "$(psql_query "SELECT status || '|' || row_version FROM public.feedback_submissions WHERE id = '$feedback_id';")"
verify "feedback review event restored" "1" \
  "$(psql_query "SELECT count(*) FROM public.feedback_review_events WHERE feedback_id = '$feedback_id';")"
verify "operator mapping enabled" "t" \
  "$(psql_query "SELECT enabled FROM public.internal_operators WHERE user_id = '$operator_id';")"
verify "RLS enabled on Provider-owned and feedback tables" "10" \
  "$(psql_query "SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relrowsecurity AND relname IN ('providers', 'provider_user_profiles', 'provider_memberships', 'repair_requests', 'repairs', 'repair_status_events', 'feedback_submissions', 'feedback_review_events', 'internal_operators', 'internal_access_audit');")"
verify "anon cannot SELECT feedback_submissions" "f" \
  "$(psql_query "SELECT has_table_privilege('anon', 'public.feedback_submissions', 'SELECT');")"
verify "anon cannot SELECT repairs" "f" \
  "$(psql_query "SELECT has_table_privilege('anon', 'public.repairs', 'SELECT');")"
verify "RPC EXECUTE grants unchanged" "$grants_before" "$(grant_snapshot)"

expected_migrations="$(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"
recorded_migrations="$(psql_query "SELECT count(*) FROM supabase_migrations.schema_migrations;")"
verify "migration history equals supabase/migrations files" \
  "$expected_migrations" "$recorded_migrations"

printf '============ restore drill summary ============\n'
printf 'api host       : %s\n' "$api_host"
printf 'dump           : roles, schema, data (temporary dir, deleted on exit)\n'
printf 'fixture        : provider + OWNER, accepted request, repair + 2 status events,\n'
printf '                 feedback + review event, operator mapping\n'
printf 'migration rows : %s recorded == %s files\n' "$recorded_migrations" "$expected_migrations"
printf 'rls            : 10 of 10 Provider-owned and feedback tables enabled\n'
printf 'grants         : anon denied on feedback and repairs; RPC EXECUTE unchanged\n'
printf 'suite result   : PASS\n'
printf '===============================================\n'
