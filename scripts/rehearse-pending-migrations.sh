#!/usr/bin/env bash
# scripts/rehearse-pending-migrations.sh
#
# Rehearses the "release-like upgrade path" required by CONTRIBUTING.md and
# docs/Tracknologia_Supabase_Migration_Rules.md (section 25 "Rules After
# Acceptance"):
#
#   existing release-like database (shared history applied)
#   -> apply ONLY the pending migrations of this branch
#   -> verify behavior with the database integration suite
#
# The script also FAILS if any already-shared (base) migration has been
# edited: accepted/shared migration history is forward-only and immutable.
#
# What it does:
#  1. Resolves the base ref (REHEARSAL_BASE_REF, or <remote>/staging).
#  2. Detects the pending migrations (files ADDED relative to the base ref)
#     and verifies no shared migration changed.
#  3. Boots a scratch Supabase lab on offset ports so the running dev stack
#     is never disturbed.
#  4. Copies only BASE migrations into the lab (exact-line exclusion of the
#     pending list), resets the lab, and proves the recorded migration history
#     equals the base set with no pending version present.
#  5. Copies the pending migration(s) in and runs `db push --local`, then
#     proves the recorded history now equals base + pending.
#  6. Runs the full database integration suite against the upgraded lab and
#     prints a bounded success summary, including the upgrade-only cases. The
#     "anon cannot SELECT raw providers" quirk is tolerated only when
#     REHEARSAL_ALLOW_ANON_QUIRK=1 is set; otherwise it fails like any failure.
#  7. If no migration is pending relative to the base ref, the rehearsal is
#     INAPPLICABLE and exits 0; shared migration edits/deletions are still
#     fatal (forward-only is immutable) so the check cannot be silently
#     skipped.
#  8. Tears the lab down (trap) and prints an evidence summary.
#
# Usage:  pnpm rehearse:migrations [--base <git-ref>]
# Env:    REHEARSAL_BASE_REF           base git ref (default: staging via a remote)
#         REHEARSAL_PORT_OFFSET        offset added to every lab port (default 4000)
#         REHEARSAL_TMPDIR             parent dir for the scratch lab (default: $TMPDIR or /tmp)
#         REHEARSAL_ALLOW_ANON_QUIRK   set to 1 to tolerate the local-only
#                                      "anon cannot SELECT raw providers" quirk
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

: "${REHEARSAL_PORT_OFFSET:=4000}"

log() { printf '[rehearse] %s\n' "$*"; }
die() { printf '[rehearse] ERROR: %s\n' "$*" >&2; exit 1; }

# Exact-line membership in a newline-separated list (one path or version per
# line). Substring or prefix matches must not count as members.
in_list() { grep -Fxq -- "$1" <<< "$2"; }

# Asserts the membership helper itself before any lab is created, so a broken
# helper cannot silently let a pending migration into the base set.
membership_self_check() {
  local sample=$'supabase/migrations/a.sql\nsupabase/migrations/b.sql'
  if ! in_list "supabase/migrations/a.sql" "$sample"; then
    die "self-check: first list line was not matched"
  fi
  if ! in_list "supabase/migrations/b.sql" "$sample"; then
    die "self-check: last list line was not matched"
  fi
  if in_list "supabase/migrations/a" "$sample"; then
    die "self-check: a prefix matched as a list member"
  fi
  if in_list "supabase/migrations/c.sql" "$sample"; then
    die "self-check: an absent path matched"
  fi
}
membership_self_check

# Evidence selectors for the verbose reporter. They are applied only to a copy
# with ANSI escapes removed, so colored output cannot hide a verdict.
strip_ansi() { sed -E 's/\x1b\[[0-9;]*[A-Za-z]//g' "$1"; }
feedback_passed_pattern='(✓|√) tests/integration/feedback\.db\.test\.ts > '
feedback_failed_pattern='(×|✗|X) tests/integration/feedback\.db\.test\.ts > '
feedback_skipped_pattern='(↓|-) tests/integration/feedback\.db\.test\.ts > '
upgrade_passed_pattern='(✓|√) tests/integration/feedback\.db\.test\.ts > pending-only upgrade preserves old-state data'

# Offline check of the selectors against one colored and one plain verbose line
# (the shape Vitest prints), so selector drift fails before any lab is created.
selector_self_check() {
  local colored plain stripped
  colored=$'\e[32m✓\e[39m tests/integration/feedback.db.test.ts\e[2m > \e[22mpending-only upgrade preserves old-state data\e[2m > \e[22mkeeps the seeded Provider, Request and Repair exactly unchanged'
  plain='✓ tests/integration/feedback.db.test.ts > pending-only upgrade preserves old-state data > keeps the seeded Provider, Request and Repair exactly unchanged'
  for line in "$colored" "$plain"; do
    stripped="$(printf '%s\n' "$line" | sed -E 's/\x1b\[[0-9;]*[A-Za-z]//g')"
    if ! grep -Eq "$feedback_passed_pattern" <<< "$stripped"; then
      die "evidence self-check: passed Feedback case not counted"
    fi
    if ! grep -Eq "$upgrade_passed_pattern" <<< "$stripped"; then
      die "evidence self-check: upgrade-only case not counted"
    fi
    if grep -Eq "$feedback_failed_pattern" <<< "$stripped"; then
      die "evidence self-check: passed line matched the failed selector"
    fi
  done
}
selector_self_check

supabase_bin="supabase"
if ! command -v supabase >/dev/null 2>&1; then
  supabase_bin="npx supabase"
  log "supabase CLI not on PATH; falling back to: npx supabase"
fi

# Every CLI invocation runs from the lab project root so the scratch project
# (config, containers, state) is fully self-contained and the repo's running
# dev stack is never touched.
cli() { ( cd "$lab_root" && $supabase_bin "$@" ); }

base_ref="${REHEARSAL_BASE_REF:-}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --base)
      if [ -z "${2:-}" ]; then
        die "--base requires a git ref (e.g. --base staging)"
      fi
      base_ref="$2"
      shift 2
      ;;
    --base=*)
      base_ref="${1#--base=}"
      shift
      ;;
    *)
      die "unexpected argument: $1 (usage: pnpm rehearse:migrations [--base <git-ref>])"
      ;;
  esac
done
if [ -z "$base_ref" ]; then
  base_ref="staging"
fi

has_ref() { git rev-parse --verify --quiet "$1" >/dev/null 2>&1; }

if has_ref "$base_ref"; then
  log "using base ref $base_ref"
else
  resolve_to=
  for remote in $(git remote); do
    candidate="$remote/$base_ref"
    if has_ref "$candidate"; then
      resolve_to="$candidate"
      break
    fi
  done
  if [ -n "$resolve_to" ]; then
    base_ref="$resolve_to"
    log "using base ref $base_ref"
  else
    log "fetching origin/$base_ref (shallow) to resolve the base baseline"
    git fetch --depth 1 origin "$base_ref" >/dev/null 2>&1 || true
    if has_ref "FETCH_HEAD"; then
      base_ref="FETCH_HEAD"
      log "using base ref FETCH_HEAD from origin/$base_ref"
    else
      die "cannot resolve base ref '$base_ref' (set REHEARSAL_BASE_REF or ensure a staging remote exists)"
    fi
  fi
fi

base_sha="$(git rev-parse --short "$base_ref")"
log "base baseline: $base_ref ($base_sha)"

changed="$(git diff --name-only "$base_ref" -- supabase/migrations || true)"
pending="$(git diff --name-only --diff-filter=A "$base_ref" -- supabase/migrations || true)"
deleted="$(git diff --name-only --diff-filter=D "$base_ref" -- supabase/migrations || true)"
modified="$(git diff --name-only --diff-filter=M "$base_ref" -- supabase/migrations || true)"

if [ -n "$deleted" ] || [ -n "$modified" ]; then
  die "shared migration history must stay immutable (forward-only). Modified/deleted base migrations:\n$(printf '%s\n' $deleted $modified)"
fi

if [ -z "$pending" ]; then
  log "no pending (added) migrations relative to $base_ref"
  printf '============ rehearsal summary ============\n'
  printf 'base baseline   : %s (%s)\n' "$base_ref" "$base_sha"
  printf 'pending set     : (none)\n'
  printf 'shared changes  : none (forward-only verified)\n'
  printf 'suite result    : INAPPLICABLE (no migration to rehearse)\n'
  printf '===========================================\n'
  exit 0
fi

# Migration version is the timestamp prefix of the file name.
migration_version() { basename "$1" | cut -d_ -f1; }

pending_versions=""
while IFS= read -r pending_file; do
  [ -n "$pending_file" ] || continue
  pending_versions="${pending_versions}$(migration_version "$pending_file")"$'\n'
done <<< "$pending"
pending_versions="${pending_versions%$'\n'}"

log "shared migrations unchanged relative to base (forward-only verified)"
log "pending migrations to apply on upgrade:"
while IFS= read -r pending_file; do
  [ -n "$pending_file" ] && printf '  %s\n' "$pending_file"
done <<< "$pending"

lab_base_dir="${REHEARSAL_TMPDIR:-${TMPDIR:-/tmp}}"
mkdir -p "$lab_base_dir"
lab_root="$(mktemp -d "$lab_base_dir/tracknologia-rehearsal-XXXXXX")"
mkdir -p "$lab_root/supabase/migrations"
cp "$repo_root/scripts/rehearse-upgrade-fixture.sql" "$lab_root/supabase/seed.sql"

cleanup() {
  log "tearing down rehearsal lab ($lab_root)"
  cli stop --no-backup >/dev/null 2>&1 || true
  rm -rf "$lab_root"
}
trap cleanup EXIT

log "initializing scratch Supabase lab"
cli init >/dev/null

log "remapping lab ports by +$REHEARSAL_PORT_OFFSET (dev stack untouched)"
export REHEARSAL_PORT_OFFSET
perl -pi -e 'if (/^(\s*(?:port|shadow_port))\s*=\s*(\d+)\s*$/) { my $n = $2 + $ENV{"REHEARSAL_PORT_OFFSET"}; $_ = "$1 = $n\n"; }' "$lab_root/supabase/config.toml"

# Base set only: every repository migration that is not a pending (added) file.
for m in supabase/migrations/*.sql; do
  if in_list "$m" "$pending"; then
    continue
  fi
  cp "$m" "$lab_root/supabase/migrations/"
done

# Fail closed: no pending file may exist in the base set before the reset.
while IFS= read -r pending_file; do
  [ -n "$pending_file" ] || continue
  if [ -e "$lab_root/supabase/migrations/$(basename "$pending_file")" ]; then
    die "pending migration $pending_file leaked into the base set"
  fi
done <<< "$pending"

log "starting lab stack"
cli start >/dev/null

lab_project_id="$(sed -n 's/^project_id = "\([^"]*\)".*/\1/p' "$lab_root/supabase/config.toml" | head -n 1)"
[ -n "$lab_project_id" ] || die "could not read the lab project id"
lab_db_container="supabase_db_${lab_project_id}"
if ! in_list "$lab_db_container" "$(docker ps --format '{{.Names}}')"; then
  die "lab database container $lab_db_container is not running"
fi

# Recorded migration versions in the lab database (service-owned history).
applied_versions() {
  docker exec "$lab_db_container" psql -X -U postgres -d postgres -tA \
    -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;" \
    | sed '/^$/d' | sort
}

# Migration versions present in the lab's migration directory.
lab_versions() {
  for f in "$lab_root"/supabase/migrations/*.sql; do
    migration_version "$f"
  done | sort
}

log "applying BASE migration history only (release-like previous state, seeded with old-state fixture)"
cli db reset >/dev/null

# Proof before the upgrade: the recorded history is exactly the base set, and
# no pending version has been applied by the base reset.
base_versions="$(lab_versions)"
applied_before="$(applied_versions)"
if [ "$applied_before" != "$base_versions" ]; then
  die "BASE reset recorded a migration history that differs from the base set"
fi
while IFS= read -r pending_version; do
  [ -n "$pending_version" ] || continue
  if in_list "$pending_version" "$applied_before"; then
    die "pending migration $pending_version was already applied by the BASE reset"
  fi
done <<< "$pending_versions"
log "pre-upgrade proof: $(printf '%s\n' "$applied_before" | grep -c .) base versions recorded, no pending version present"

log "copying pending migration(s) and applying ONLY pending (upgrade path)"
while IFS= read -r pending_file; do
  [ -n "$pending_file" ] && cp "$pending_file" "$lab_root/supabase/migrations/"
done <<< "$pending"
( cd "$lab_root" && printf 'y\n' | $supabase_bin --yes db push --local ) >/dev/null

# Proof after the upgrade: the recorded history is exactly base + pending.
expected_versions="$(lab_versions)"
applied_after="$(applied_versions)"
if [ "$applied_after" != "$expected_versions" ]; then
  die "post-upgrade recorded history does not match base + pending"
fi
while IFS= read -r pending_version; do
  [ -n "$pending_version" ] || continue
  if ! in_list "$pending_version" "$applied_after"; then
    die "pending migration $pending_version is not recorded after the upgrade"
  fi
done <<< "$pending_versions"
log "post-upgrade proof: pending versions recorded after db push, history equals base + pending"

# db push does not restart the API/PostgREST, so its cached schema (loaded at
# start time) would miss the newly applied functions. Real upgrades refresh the
# API the same way; bounce the lab stack so the integration suite exercises
# the post-upgrade schema, exactly like `supabase db reset` does for the dev
# stack in the clean-replay path. `stop` preserves the database volume, so the
# base + pending state survives the bounce.
log "bouncing lab stack so the API reloads the upgraded schema"
cli stop >/dev/null 2>&1 || true
cli start >/dev/null

log "exporting lab environment"
lab_env="$(cli status -o env)"
eval "$lab_env"
# Always target the LAB, even if stale SUPABASE_TEST_* values were inherited
# from the environment (e.g. the dev-stack export earlier in a CI job).
export SUPABASE_TEST_URL="$API_URL"
export SUPABASE_TEST_ANON_KEY="$ANON_KEY"
export SUPABASE_TEST_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
# Tells the suite the old-state fixture was seeded before the upgrade, so it
# verifies that the pending-only upgrade preserved that data.
export REHEARSAL_UPGRADE_FIXTURE=1
log "lab API URL: $SUPABASE_TEST_URL"

results="$lab_root/db-suite.log"
plain_results="$lab_root/db-suite.plain.log"
log "running the database integration suite against the upgraded lab"
set +e
NO_COLOR=1 FORCE_COLOR=0 pnpm exec vitest run --reporter=verbose tests/integration >"$results" 2>&1
rc=$?
set -e
strip_ansi "$results" > "$plain_results"

# Bounded per-case counts from the plain copy of the verbose reporter. Only
# names and verdicts are read; nothing from the fixture or SQL payload is
# printed.
count_lines() { grep -Ec "$1" "$plain_results" || true; }
feedback_passed="$(count_lines "$feedback_passed_pattern")"
feedback_failed="$(count_lines "$feedback_failed_pattern")"
feedback_skipped="$(count_lines "$feedback_skipped_pattern")"
upgrade_passed="$(count_lines "$upgrade_passed_pattern")"

if [ "$rc" -ne 0 ] && [ "${REHEARSAL_ALLOW_ANON_QUIRK:-0}" = "1" ]; then
  known_anon_failure=0
  if grep -q "Tests  1 failed | " "$plain_results" \
     && grep -q "anon cannot SELECT raw providers" "$plain_results" \
     && ! grep -qE "Tests  [2-9][0-9]* failed" "$plain_results"; then
    known_anon_failure=1
  fi
  if [ "$known_anon_failure" -eq 1 ]; then
    printf '[rehearse] warning: exactly one suite failure is the known local env-specific\n'
    printf '            "anon cannot SELECT raw providers" default-grant quirk (CI stacks are green).\n'
    printf '            Treating the rehearsal as passed (REHEARSAL_ALLOW_ANON_QUIRK=1).\n'
    rc=0
  fi
fi

# Evidence checks run after any tolerance above, so no flag can skip them. A
# successful run must include the Feedback cases, have no Feedback failures,
# and actually execute both upgrade-only cases.
if [ "$rc" -eq 0 ]; then
  if [ "$feedback_passed" -lt 1 ] || [ "$feedback_failed" -ne 0 ]; then
    rc=1
    log "Feedback suite evidence is missing or incomplete"
  elif [ "$upgrade_passed" -lt 2 ]; then
    rc=1
    log "pending-only upgrade cases did not run (expected 2 passing, found $upgrade_passed)"
  else
    log "database integration suite PASSED against the upgraded lab"
  fi
fi

if [ "$rc" -ne 0 ]; then
  log "database integration suite FAILED against the upgraded lab:"
  sed -n '/RUN /,$p' "$plain_results" | tail -40 >&2
fi

printf '============ rehearsal summary ============\n'
printf 'base baseline   : %s (%s)\n' "$base_ref" "$base_sha"
printf 'pending set     : %s\n' "$(basename -a $(printf '%s\n' "$pending") | tr '\n' ' ')"
printf 'pending versions: %s\n' "$(printf '%s\n' "$pending_versions" | tr '\n' ' ')"
printf 'pre-upgrade     : history == base set, no pending version recorded\n'
printf 'post-upgrade    : history == base + pending, pending versions recorded\n'
printf 'shared changes  : none (forward-only verified)\n'
printf 'lab api url     : %s\n' "${SUPABASE_TEST_URL:-}"
printf 'feedback cases  : %s passed, %s failed, %s skipped\n' "$feedback_passed" "$feedback_failed" "$feedback_skipped"
printf 'upgrade cases   : %s passed (old-state fixture verified)\n' "$upgrade_passed"
printf 'suite result    : %s\n' "$([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"
printf '===========================================\n'

exit "$rc"
