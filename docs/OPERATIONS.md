# Operations & Hotfix

Canonical operational reference for Tracknologia after deployment: what to watch, how to classify incidents, and how to fix and release under pressure. The reviewed handoff specification (`docs/release/v0.1.0-hardening/handoff/08_POST_DEPLOYMENT_STABILIZATION.md`) remains the source of truth; this document is the day-to-day entry point and stays aligned with it. Update this document (only) as real incidents, verified recovery steps, and production thresholds accumulate — do not fork duplicate runbooks.

Deployment is the start of operational validation, not the end of engineering work.

## Post-deployment monitoring

### First hour

Watch:

```text
HTTP 5xx
unexpected 4xx
429 / rate-limit behavior
Supabase / Auth failures
database connections
slow queries
email failures
Tracking failures
request failures
```

Repeat the critical smoke flows manually against production using non-sensitive test data.

### First-day review

Review:

```text
onboarding failures
invite failures
Request submission rates / errors
Repair creation / status errors
Tracking success / errors
rate-limit events
database growth
support / user feedback
```

Log hygiene: logs must never contain raw Tracking credentials or unnecessary customer data.

## Incident severity

### P0

```text
tenant breach
credential exposure
private-data leak
destructive corruption
```

Response: contain the affected seam, preserve evidence, hotfix immediately, add a security regression test, and create an incident record.

### P1

```text
core workflow outage
widespread auth failure
Request/Tracking outage
migration failure
Staff authorization defect
```

Immediate hotfix.

P2/P3 return to the normal backlog unless impact escalates.

## Hotfix flow

```text
hotfix/<issue>
  -> staging
  -> full affected validation
  -> master
  -> deploy
  -> smoke
```

Never patch only `master` while leaving `staging` divergent.

If emergency SQL/config action is performed manually in production, immediately reconcile the exact change into version-controlled migration/configuration and verify staging equivalence.

## Rollback vs forward fix

Roll back only when:

```text
the previous application remains schema-compatible
the failure is application-only
rollback is safer
```

Do a forward fix when:

```text
a migration already changed preserved schema/data
the old application is incompatible
rollback increases inconsistency/risk
```

## Manual backups (free plan)

The Supabase free plan has no hosted backups, so the pilot relies on manual
dumps. Owner decision (2026-10-30, recorded on #87:
https://github.com/Jacinth091/Tracknologia/issues/87#issuecomment-6537380262).

The accepted data-loss window (RPO) is up to about 7 days, the time since the
last successful dump. Data written after that dump is lost if the database
fails. The owner runs the dumps and checks them.

Recovery is forward-fix, because migrations are forward-only. Restore from the
latest dump only for data loss.

### Routine

Take a dump:

- before launch;
- weekly during the pilot;
- before every migration deploy.

```bash
# DATABASE_URL is the connection string from the Supabase dashboard. It holds
# the database password: keep it out of shell history, files and Git.
supabase db dump --db-url "$DATABASE_URL" -f roles.sql --role-only
supabase db dump --db-url "$DATABASE_URL" -f schema.sql
supabase db dump --db-url "$DATABASE_URL" -f data.sql --use-copy --data-only \
  -s public,auth,supabase_migrations -x auth.schema_migrations
```

Handling:

- Store each dump privately and encrypted. Never commit a dump, a connection
  string or a decrypted file to Git.
- Dumps hold customer, Provider and Auth data. Treat them as personal data.
- Keep the last 2–3 dumps and delete older ones, consistent with the notice's
  "backups for a limited time" wording.

### Restore

Restoring replaces data in the target. Restore only into a fresh project or a
reset database, never over a live project without an owner decision to roll
data back.

Before the restore, remove the project's default privileges on the target, as
the postgres role:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
```

> **Warning:** skipping this step silently re-grants `anon` and `authenticated`
> on every restored table, sequence and function. `pg_dump` records only the
> grants that differ from the built-in default, never "anon was revoked", so the
> project's default privileges would bring the revoked access back.

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql --dbname "$TARGET_DATABASE_URL"
```

After the restore, put the default privileges back, so later migrations behave
as on the original project. Restored objects keep the dump's grants:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
```

Then check:

1. `select count(*) from supabase_migrations.schema_migrations;` equals the
   number of files in `supabase/migrations/`.
2. RLS is enabled on the Provider-owned and feedback tables, and `anon` and
   `authenticated` cannot select from `public.feedback_submissions`.
3. The expected operators are enabled in `public.internal_operators`.
4. Reset custom role passwords and recreate any replication subscriptions, as
   Supabase's backup guide requires after a restore.

The CI drill proves these steps on a disposable local stack. It runs
`scripts/drill-backup-restore.sh` in the Database integration job, and it does
not replay `roles.sql`, because the roles already exist in that cluster. See
[TESTING.md](TESTING.md#backup-and-restore-drill).

## Stabilization window

For several days after each release:

```text
pause major feature work
prioritize production defects
watch real load
watch abuse controls
watch DB/query behavior
watch analytics storage
```

Resume the next feature milestone only after no unresolved production P0/P1 remains.

## Internal operator access runbook

Internal operator access is private operational state, not a Provider role.
Provisioning and revocation are deliberate manual operations, never a web
action, seed, signup trigger, or `user_metadata` flag.

### Approval gate

Before any change, require explicit owner approval for:

```text
target Auth user
grant or revoke
concise non-PII approval reference as the bounded reason (3-200 characters),
for example a ticket id; never a name, email address, or raw payload
approver and date recorded outside the product (issue/ticket)
```

Do not grant access to a Provider owner/staff account merely because it manages
a Provider. If the same person needs both, that is two separate authorizations.

### Identity discovery and execution context

Resolve the operator and approver UUIDs from the trusted Supabase Auth admin
surface (Supabase Dashboard -> Authentication -> Users, or the Auth admin API),
never from application tables, email guesses, or values copied out of a chat
message. Both must already be existing, verified team Auth identities; this
runbook never creates identities.

The SQL examples below must run in a trusted SQL editor or owner-controlled
admin connection (for example the Supabase SQL editor or `psql` as an
administrator). They are not an HTTP request. Application or automation use
instead calls the narrow `change_internal_operator_access` RPC through the
service-role credential: a service API key is an HTTP credential, not a SQL
connection, and cannot be pasted into these statements. Never place keys,
tokens, or personal email addresses into SQL, docs, or tickets; use the
placeholder UUIDs below only.

### Grant

Run in that trusted admin connection, using placeholder values:

```sql
select public.change_internal_operator_access(
  '<operator-auth-user-uuid>'::uuid,
  '<approver-auth-user-uuid>'::uuid,
  true,
  'owner-approved internal operator grant <ticket>'
);
```

The function returns `true` when the state changed and `false` for an idempotent
repeat (no duplicate audit event). It refuses missing arguments and out-of-bound
reasons, and it rolls everything back if the required audit insert fails (for
example an invalid actor identity).

Verify:

```sql
select user_id, enabled, provisioned_at, revoked_at, reason
from public.internal_operators
where user_id = '<operator-auth-user-uuid>'::uuid;

select event_id, operator_user_id, actor_user_id, operation, reason, created_at
from public.internal_access_audit
where operator_user_id = '<operator-auth-user-uuid>'::uuid
order by created_at desc;
```

Then have the operator sign in and confirm `/internal` renders. A successful
sensitive render appends an `INTERNAL_ACCESS_VIEW` event; no application session
inherits access merely from an Auth login.

### Revoke

```sql
select public.change_internal_operator_access(
  '<operator-auth-user-uuid>'::uuid,
  '<approver-auth-user-uuid>'::uuid,
  false,
  'owner-approved internal operator revoke <ticket>'
);
```

Revocation takes effect on the next guarded request; there is no process/global
permission cache. The signed-in browser session is not destroyed, but every
internal render and every required audit append rechecks `enabled` and is
denied. Confirm by reloading `/internal` and expecting the private 404.

### Rotation and break-glass

```text
normal rotation: revoke the old operator mapping, grant the replacement
lost device/session: revoke plus standard Auth password/session reset
suspected compromise: revoke immediately, then review audit events and Auth logs
break-glass: temporary grant with an explicit reason, revoked immediately after use
```

Never share one operator identity between people. Every grant/revoke and every
sensitive view is attributed to the actor recorded at write time.

### Auth identity deletion

Deleting the Auth user cascades the live `internal_operators` row away and sets
the retained audit `operator_user_id`/`actor_user_id` references to null. The
operation, reason and timestamp of each retained event remain, and a reason that
names an external ticket can still be linked to that person through the ticket.
This is not full anonymization. Retention, redaction and purge policy stays
pending owner approval (issue #87) and is not implemented. The FK action runs as
the table owner; no client grant is required or added.

### Feedback redaction and deletion

Participant feedback lives in private tables with no client write path and no
linked business identity. Redaction and purge are two separate, owner-only
procedures in the trusted SQL connection (the same context as the Grant/Revoke
steps). Each is one transaction, and each must have an owner-approved ticket
and the policy approval of issue #87 before it touches participant data. Do not
combine them, and do not treat one as the other: redaction keeps the record,
purge erases it.

Both blocks share the same rules:

- Replace every `<...>` placeholder with a verified Auth UUID or a bounded
  approval reference (letters, digits and `#._/:-`, 3-80 characters). An
  unreplaced or malformed value raises before any write.
- `<actor-auth-user-uuid>` is the Auth UUID of the administrator who executes
  this block, entered as the actor. Enter the executing person's own UUID. Do
  not substitute the approver's UUID unless the approver is also the person
  executing it. Owner approval is recorded separately in `<approval-ref>`, the
  ticket reference, and in the ticket outside the product.
- The target row is locked with `FOR UPDATE` and must exist. Each mutation must
  affect exactly the expected rows, or the block raises.
- The `feedback_privacy_audit` insert is part of the same transaction. If it
  fails (for example an unknown actor UUID), every change in that block rolls
  back.
- The block runs as the table owner. No client role can call or write these
  statements, and the audit row never holds participant text.
- The block ends with `rollback;`. This is the rehearsal default and discards
  everything. Change that final statement to `commit;` only after a rehearsal
  has been reviewed and the approval is recorded.

Redaction removes prohibited participant free text and internal notes, and it
also removes free-text reasons from review history. It keeps the row, status,
priority, linked issue URL, timestamps and review history. It bumps `row_version`
so that any triage form loaded before the redaction is rejected as a version
conflict and cannot restore the erased text. The review stamp is filled only
where it is null, so existing triage attribution is never overwritten. The
version change itself is recorded as a `FEEDBACK_REDACTED` event in the privacy
audit. The redaction also sets `privacy_reviewed_at` to now(), so the submission
leaves the 90-day due queue.

On a row that was never reviewed (`row_version` 1), the redaction is the first
touch. It fills `reviewed_at` and `reviewed_by` with the actor and time to
satisfy the existing review-stamp CHECK. Those stamps are administrative
metadata and do not mean triage occurred: `status` stays `NEW`, `priority`
stays `NORMAL`, and the review history stays empty. Real triage is shown by
review events and status. The block does not change the schema.

```sql
-- runbook: feedback-redaction
-- Owner-approved redaction of one Feedback submission's participant text. Keeps
-- the row, status, priority, linked issue, timestamps and review history.
-- Rehearsal default ends with rollback;. Change the final statement to commit;
-- only after review and the #87 approval.
begin;
do $$
declare
  v_feedback_id uuid := '<feedback-submission-uuid>'::uuid;
  v_actor_user_id uuid := '<actor-auth-user-uuid>'::uuid;
  v_approval_ref text := '<approval-ref>';
  v_rows integer;
begin
  if v_approval_ref !~ '^[A-Za-z0-9#._/:-]{3,80}$' then
    raise exception 'Approval reference is missing or out of bounds';
  end if;

  perform 1
  from public.feedback_submissions
  where id = v_feedback_id
  for update;
  if not found then
    raise exception 'Target feedback submission not found';
  end if;

  update public.feedback_submissions
  set title = case when title is null then null else '[redacted]' end,
      message = '[redacted]',
      internal_notes = null,
      row_version = row_version + 1,
      reviewed_at = coalesce(reviewed_at, now()),
      reviewed_by = coalesce(reviewed_by, v_actor_user_id),
      privacy_reviewed_at = now()
  where id = v_feedback_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Redaction must affect exactly one submission, affected %', v_rows;
  end if;

  update public.feedback_review_events
  set reason = null
  where feedback_id = v_feedback_id
    and reason is not null;

  insert into public.feedback_privacy_audit
    (operation, target_feedback_id, actor_user_id, approval_ref)
  values
    ('FEEDBACK_REDACTED', v_feedback_id, v_actor_user_id, v_approval_ref);
end $$;
rollback;
```

Purge erases one submission and its review history. It is destructive and cannot
be undone after `commit;`. The purge audit row keeps only the fixed operation,
the target UUID (which has no foreign key and so survives the purge), the actor,
and the approval reference:

```sql
-- runbook: feedback-purge
-- Owner-approved erasure of one Feedback submission and its review history.
-- Destructive: irreversible after commit;. Rehearsal default ends with
-- rollback;. Change the final statement to commit; only after review and the
-- #87 approval.
begin;
do $$
declare
  v_feedback_id uuid := '<feedback-submission-uuid>'::uuid;
  v_actor_user_id uuid := '<actor-auth-user-uuid>'::uuid;
  v_approval_ref text := '<approval-ref>';
  v_rows integer;
begin
  if v_approval_ref !~ '^[A-Za-z0-9#._/:-]{3,80}$' then
    raise exception 'Approval reference is missing or out of bounds';
  end if;

  perform 1
  from public.feedback_submissions
  where id = v_feedback_id
  for update;
  if not found then
    raise exception 'Target feedback submission not found';
  end if;

  delete from public.feedback_review_events
  where feedback_id = v_feedback_id;

  delete from public.feedback_submissions
  where id = v_feedback_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Purge must affect exactly one submission, affected %', v_rows;
  end if;

  insert into public.feedback_privacy_audit
    (operation, target_feedback_id, actor_user_id, approval_ref)
  values
    ('FEEDBACK_PURGED', v_feedback_id, v_actor_user_id, v_approval_ref);
end $$;
rollback;
```

Mark privacy review done (kept) is for a submission whose text needs no change:
it is useful, carries no personal details, and should be kept. The block changes
no text, status, priority or history. It sets `privacy_reviewed_at` to now() and
writes a `FEEDBACK_PRIVACY_REVIEWED` audit row, so the submission leaves the
90-day due queue:

```sql
-- runbook: feedback-privacy-review-kept
-- Owner-approved privacy review that keeps one Feedback submission unchanged.
-- Sets privacy_reviewed_at so the item leaves the 90-day due queue. Changes no
-- text, status, priority or history. Rehearsal default ends with rollback;.
-- Change the final statement to commit; only after review and the #87 approval.
begin;
do $$
declare
  v_feedback_id uuid := '<feedback-submission-uuid>'::uuid;
  v_actor_user_id uuid := '<actor-auth-user-uuid>'::uuid;
  v_approval_ref text := '<approval-ref>';
  v_rows integer;
begin
  if v_approval_ref !~ '^[A-Za-z0-9#._/:-]{3,80}$' then
    raise exception 'Approval reference is missing or out of bounds';
  end if;

  perform 1
  from public.feedback_submissions
  where id = v_feedback_id
  for update;
  if not found then
    raise exception 'Target feedback submission not found';
  end if;

  update public.feedback_submissions
  set privacy_reviewed_at = now()
  where id = v_feedback_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Privacy review mark must affect exactly one submission, affected %', v_rows;
  end if;

  insert into public.feedback_privacy_audit
    (operation, target_feedback_id, actor_user_id, approval_ref)
  values
    ('FEEDBACK_PRIVACY_REVIEWED', v_feedback_id, v_actor_user_id, v_approval_ref);
end $$;
rollback;
```

Routine triage is unaffected: `INTERNAL_ACCESS_VIEW` stays an access-only event
with a null reason, and neither block writes to `internal_access_audit`. There
is no public or Provider path to feedback lookups, and no automated GitHub
posting; the linked-issue field in triage is a written reference only.

### 90-day feedback review

Participant feedback older than 90 days, with no privacy review recorded, is due
(issue #87, decision 7; issue #108). Work through the due items as follows:

1. In the internal Feedback Inbox, tick "Due for review (90+ days)" and apply
   the filters. The list then shows only submissions created more than 90 days
   ago that have no privacy review recorded.
2. Open each item and read the original text. The "May contain personal
   details" badge is a hint, so check the text yourself as well.
   - If it has personal details, run the feedback redaction block above for that
     submission, under its owner-approved ticket and the #87 approval.
   - If it has no value to keep, run the feedback purge block above for that
     submission, under the same approval.
   - If it is useful and has no personal details, run the "Mark privacy review
     done (kept)" block above for that submission, under the same approval.
3. Each item leaves the queue once it is redacted, purged or marked. Redacting
   also clears the badge, because the text changes. Changing only the status or
   priority does not remove an item. Privacy review must be recorded with one of
   the blocks above.

### What is out of scope

```text
audit retention/purge window, archive, or reporting surface (issue #87 approval)
Provider/owner automatic internal access
internal provisioning UI or Server Action
publishable-key access to the audit or admin functions
```

## Uptime monitoring

Uptime monitoring is an operator setup checklist. It is **not active** until the
production deployment exists and the first alert test is done.

Setup, using UptimeRobot (Free):

- [ ] Create one HTTP(S) monitor on `<app-url>/api/health`.
- [ ] Set the interval to 5 minutes.
- [ ] Add an alert contact owned by the operator.
- [ ] Trigger a test alert and confirm it arrives.

Once set up:

- `200` with `{"status":"healthy"}` means the app reached its database.
- `503` with `{"status":"unavailable"}` means it did not. Check the production
  logs for `[HEALTH_FAILURE]` and the database status before acting.
- There is no detail by design. The body and headers reveal nothing about the
  cause, version or hostname.

Record each incident as a GitHub issue with the #87 fields: start, end, impact,
category, status, resolution and release ref. Never include participant data.

## Exit criteria

```text
[ ] no unresolved production P0/P1
[ ] error rate stable
[ ] DB integrity stable
[ ] abuse controls behave as expected
[ ] core journeys stable
[ ] emergency manual actions reconciled to repository
[ ] operational runbook updated (this document)
[ ] v0.2 backlog reprioritized from production evidence
```
