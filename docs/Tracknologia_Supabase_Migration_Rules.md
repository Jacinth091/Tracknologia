# Tracknologia Supabase Migration Rules

**Status:** REQUIRED ENGINEERING RULE  
**Owner:** Technical Lead  
**Applies to:** Every Supabase/PostgreSQL schema, RLS, function, trigger, enum, index, constraint, and data-migration change.

## 1. Core Rule

> **A committed migration represents an intentional database transition, not a debugging diary.**

During feature development, an unaccepted migration may be corrected, replaced, or squashed while every environment using it is explicitly disposable.

Once a migration becomes part of an accepted non-disposable shared baseline, it is immutable. Every later correction must use a new forward migration.

---

## 2. Migration Lifecycle

```text
FEATURE DEVELOPMENT
        |
        v
Experimental migration
        |
        v
May edit / replace / squash
        |
        v
Fresh-database verification
        |
        v
Security / schema review
        |
        v
Lead approval
        |
        v
Accepted shared baseline
        |
        v
IMMUTABLE MIGRATION
        |
        `--> later change = new forward migration
```

---

## 3. Experimental vs Accepted

### Experimental

A migration is experimental only when all are true:

- the feature is not yet accepted;
- the migration is not part of a non-disposable shared baseline;
- any database containing it may be reset without losing important data;
- the team knows the migration is still under development.

Experimental migrations may be edited, renamed, replaced, combined, split, removed, or re-authored.

### Accepted

A migration becomes accepted when the Technical Lead approves it as part of a database baseline that must be preserved.

Accepted migrations are immutable.

Do not:

- edit their SQL;
- rename them;
- reorder them;
- delete them;
- change their timestamp/version.

If an accepted migration is wrong:

```text
preserve old migration
        |
        v
create new corrective migration
```

---

## 4. Reset and History-Rewrite Authority

Developers may reset their own disposable local database.

A migration already applied to the team's shared development Supabase environment must not be rewritten silently.

> **Only the Technical Lead may authorize resetting a shared development database or rewriting migration history already applied there.**

Before a shared reset:

```text
[ ] Confirm environment is development-only.
[ ] Confirm no production/pilot/valuable data must be preserved.
[ ] Notify the team.
[ ] Ensure required schema behavior exists in version-controlled migrations.
[ ] Ensure no required state exists only through manual Dashboard/SQL changes.
[ ] Reset the environment.
[ ] Apply the full migration chain from zero.
[ ] Run verification and security tests.
```

---

## 5. When a Clean Reset Is Appropriate

A clean reset/re-authored baseline is appropriate when:

```text
development/test environment
AND
data is reproducible/disposable
AND
migration set is not yet accepted
AND
schema/domain/security contract materially changed
```

Examples:

- an experimental signup trigger was rejected;
- initial RLS policies are insecure;
- multiple fix migrations accumulated before first review;
- the domain model changed during development;
- no important data needs preservation.

Do not reset accepted/non-disposable environments simply because migration history looks untidy.

---

## 6. Migration Naming

Names describe the transition, not the debugging incident.

Prefer:

```text
20260820xxxxxx_create_provider_identity.sql
20260820xxxxxx_add_provider_access_rls.sql
20260820xxxxxx_create_provider_invitations.sql
20260820xxxxxx_restrict_provider_membership_creation.sql
```

Avoid:

```text
fix.sql
fix_auth.sql
fix_auth_2.sql
final_fix.sql
fix_rls_again.sql
temp_workaround.sql
really_final.sql
```

---

## 7. Coherent Migration Scope

A migration should represent one coherent transition.

Good examples:

```text
create Provider identity tables
add Provider access policies
create Staff invitation relation
```

Do not combine unrelated schema concerns simply because they were implemented on the same day.

Also do not fragment one atomic transition into many tiny files solely for file-count purity.

---

## 8. No Patch-on-Patch Development History Before Acceptance

If a feature migration is unaccepted and wrong, fix the intended baseline instead of accumulating development patches.

Bad unaccepted history:

```text
0001_create_memberships.sql
0002_fix_memberships.sql
0003_fix_memberships_again.sql
0004_fix_membership_recursion.sql
```

Preferred before acceptance:

```text
0001_create_provider_identity.sql
0002_add_provider_access_rls.sql
```

where the files contain the reviewed intended design.

This rule stops at acceptance. Accepted history must not be rewritten.

---

## 9. Fresh-Database Reproducibility Is Mandatory

Before acceptance:

```text
empty database
    |
    v
apply all repository migrations in order
    |
    v
expected schema
    |
    v
expected constraints
    |
    v
expected RLS
    |
    v
tests pass
```

A manually repaired developer Supabase project is not evidence that the migration chain is valid.

Defects include:

```text
"the table already existed on my database"
"I created the enum manually"
"I changed the policy in the Dashboard"
"it only works when migration X is skipped"
```

Everything needed for the accepted schema must be reproducible from version control.

---

## 10. Do Not Hide Schema Drift with Defensive DDL by Default

Use constructs such as these deliberately, not automatically:

```sql
CREATE TABLE IF NOT EXISTS ...
DROP ... IF EXISTS ...
EXCEPTION WHEN duplicate_object THEN ...
```

Normal ordered migrations should generally expect the previous migration state to be correct.

Unexpected state often should fail loudly so schema/history drift is detected.

---

## 11. Security-Sensitive Migrations Require Adversarial Tests

Security-sensitive changes include:

- RLS;
- Provider ownership;
- `provider_memberships`;
- `provider_invitations`;
- OWNER/STAFF authorization;
- public/anonymous access;
- `SECURITY DEFINER`;
- Auth-linked triggers/functions;
- privileged grants.

SQL compiling is insufficient.

Required test pattern:

```text
Given an attacker identity
When the attacker attempts a forbidden operation
Then PostgreSQL/RLS denies it
```

Required scenarios where applicable:

```text
Provider A exists
User B tries to self-create membership in Provider A
-> DENIED

Provider A user queries Provider B-owned data
-> DENIED

Expired invitation is accepted
-> DENIED

Revoked invitation is accepted
-> DENIED

Consumed invitation is reused
-> DENIED

Valid invite is accepted once
-> STAFF membership created
-> invitation consumed atomically
```

---

## 12. Least Privilege

Review broad grants such as:

```sql
GRANT ALL ...
```

with suspicion.

Grant only what the actual application path requires.

Application authorization and RLS are both required. RLS is defense in depth, not a substitute for feature Module authorization.

---

## 13. Provider Membership Creation Rule

No general authenticated RLS policy may allow a user to choose an arbitrary Provider and create membership for themselves.

Forbidden pattern:

```sql
WITH CHECK (user_id = auth.uid())
```

when `provider_id` and `role` remain caller-controlled.

Approved membership paths are:

```text
Independent onboarding
-> create Provider + initial OWNER atomically

Shop Owner onboarding
-> create Provider + initial OWNER atomically

Shop Staff
-> consume valid OWNER-authorized invitation
-> create STAFF membership atomically
```

There is no public self-join path.

---

## 14. Provider Creation Rule

Creating a Supabase Auth user must not automatically create a Tracknologia Provider.

Do not use:

```text
auth.users INSERT trigger
-> create Provider
-> create OWNER membership
```

Provider creation is an explicit business operation.

This preserves:

- Staff users joining an existing Shop;
- authenticated users who have not completed onboarding;
- clean Auth/Providers Module ownership;
- fail-closed ProviderContext resolution.

---

## 15. Transaction Rules

The following must be atomic:

```text
create new Provider
+
create initial OWNER membership
```

and:

```text
validate Staff invitation
+
create STAFF membership
+
mark invitation accepted/consumed
```

Do not permit partial success.

Use one database transaction or a narrowly designed database function/RPC if required to guarantee atomicity.

---

## 16. `SECURITY DEFINER` Functions

`SECURITY DEFINER` requires explicit review.

Checklist:

```text
[ ] Function has one narrow purpose.
[ ] Caller authorization is checked inside the function.
[ ] Inputs are validated.
[ ] search_path is constrained.
[ ] Caller cannot choose privileged Provider/role values without authorization.
[ ] Function cannot be abused to bypass ownership/RLS.
[ ] Hostile caller scenarios are tested.
[ ] EXECUTE is granted only to intended roles.
```

Do not use `SECURITY DEFINER` merely to make an RLS error disappear.

---

## 17. RLS Review Questions

For every Provider-owned table answer:

```text
Who may SELECT?
Who may INSERT?
Who may UPDATE?
Who may DELETE?
How is Provider ownership derived?
Can caller-controlled fields alter ownership?
Can a policy recurse through the same protected relation?
Does anon access expose a raw row where a restricted projection is needed?
```

Public information should be deliberately projected rather than exposing unrestricted raw business rows.

---

## 18. Database Constraints Enforce Database-Level Invariants

Use constraints where concurrency/integrity requires them.

Examples:

```text
UNIQUE(provider_id, user_id)
unique Provider slug
valid Provider type
valid membership role
unique invitation token hash
Request-to-Repair uniqueness
Tracking Code uniqueness
```

Do not rely only on browser/UI checks for durable integrity.

---

## 19. Migrations Do Not Replace Feature Module Behavior

Database security and feature behavior work together.

```text
RLS
-> database-level Provider isolation

Auth Module
-> resolves trusted ProviderContext
```

Likewise:

```text
database constraint
-> persistence integrity

feature Interface
-> validates and coordinates business behavior
```

Do not move the entire domain into triggers merely because PostgreSQL can execute it.

---

## 20. Supabase Temporary State Is Never Source

Add/retain:

```gitignore
supabase/.temp/
```

Do not commit local Supabase CLI state such as:

```text
supabase/.temp/linked-project.json
supabase/.temp/project-ref
supabase/.temp/pooler-url
CLI/cache/version temp state
```

Environment-specific temporary state is not migration history.

---

## 21. No Uncaptured Dashboard Schema Changes

Do not make permanent schema/RLS/function changes only through the Supabase Dashboard.

If a manual experiment is used:

```text
manual experiment
    |
    v
verify idea
    |
    v
encode final transition in migration
    |
    v
reset/reconcile disposable environment
    |
    v
verify entirely from version control
```

---

## 22. Test/Seed Data Is Separate from Schema History

Do not put arbitrary development users, Providers, Repairs, or invitations into schema migrations.

Only deterministic reference data that is part of the durable application contract belongs in migrations.

Demo/test records belong in seed tooling or fixtures.

---

## 23. Required PR Evidence

A database-changing PR must state:

```text
Database change
- tables/columns affected
- constraints affected
- RLS/policies affected
- functions/triggers affected
- experimental or forward-only accepted-history migration

Environment
- fresh reset tested? yes/no
- existing shared data preserved? yes/no

Verification
- migration command/result
- schema tests
- RLS/security tests
- affected application tests
```

Do not claim checks passed unless they were actually run.

---

## 24. Lead Acceptance Gate

Before a migration becomes immutable accepted history:

```text
[ ] Domain model and schema agree.
[ ] Table ownership matches the owning Module.
[ ] Migration has a coherent purpose.
[ ] Name describes the transition.
[ ] Full migration chain applies to an empty database.
[ ] No required manual database edits are missing.
[ ] Important invariants have database constraints.
[ ] RLS follows least privilege.
[ ] Arbitrary Provider self-membership is impossible.
[ ] Public access is intentionally restricted.
[ ] SECURITY DEFINER received explicit review where used.
[ ] Security-sensitive paths have adversarial tests.
[ ] Multi-write invariants are transaction-safe.
[ ] No Supabase .temp files are committed.
[ ] Technical Lead approves making the migration immutable.
```

---

## 25. Rules After Acceptance

Once accepted:

```text
DO
- add new forward migrations
- keep old migration files untouched
- test the upgrade path
- document material schema/security changes

DO NOT
- edit old migration SQL
- delete old migrations
- rename old migrations
- change migration timestamps/order
- reset a non-disposable environment to avoid a corrective migration
```

---

## 26. Current Tracknologia Reset Ruling

For the current Feature 01/Provider foundation work:

- the Supabase project contains disposable development/test data;
- the existing four Auth/Provider migrations are unaccepted experimental history;
- the onboarding design changed materially;
- the current chain contains rejected signup-trigger/RLS behavior.

The Technical Lead therefore authorizes:

```text
shared development reset
+
clean re-authored Auth/Provider baseline
```

The replacement must support:

```text
explicit Independent onboarding
explicit Shop Owner onboarding
invitation-only Shop Staff membership
read-only/fail-closed Auth ProviderContext resolution
least-privilege Provider isolation
```

After the clean baseline is re-reviewed and accepted, it becomes immutable under this document.

---

## 27. Enforcement

A PR violating these migration rules should be returned to Dev even if the application appears to work.

Database history, security, RLS, and reproducibility are part of the implementation, not optional cleanup.
