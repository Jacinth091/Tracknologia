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
bounded reason (3-200 characters)
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

Deleting the Auth user cascades the live `internal_operators` row away and
anonymizes retained audit FKs (`operator_user_id`/`actor_user_id` become null)
while preserving the non-identifying event. The FK action runs as the table
owner; no client grant is required or added.

### What is out of scope

```text
audit retention/purge window, archive, or reporting surface (issue #87 approval)
Provider/owner automatic internal access
internal provisioning UI or Server Action
publishable-key access to the audit or admin functions
```

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
