# Tracknologia Feature 01 Auth Rework — Lead Decision Handoff

**Routing:** RETURN TO DEV  
**Decision status:** LD-01, LD-02, and LD-03 are LOCKED.  
**Purpose:** Translate the Lead decisions into the implementation target for the Feature 01 Auth rework.

## Target Auth Module

Feature 01 should answer:

```text
Who is the authenticated User?
Which valid Provider membership do they already have?
What role are they authorized to use?
```

It must not answer those questions by silently creating missing business entities.

## Required dependency direction

```text
src/app
   |
   v
src/features/auth
   |
   v
Auth/session + membership persistence
   |
   v
Supabase/PostgreSQL
```

Provider creation and Staff invitation behavior belong to the Providers capability rather than `requireProviderContext()`.

---

## Approved onboarding paths

### Independent Repairer

```text
Get Started
-> Independent Repairer
-> Create/authenticate User
-> Independent onboarding
-> create INDEPENDENT Provider + OWNER membership atomically
```

### Shop Owner

```text
Get Started
-> Repair Shop
-> Shop Owner
-> Create/authenticate User
-> Shop onboarding
-> create SHOP Provider + OWNER membership atomically
```

### Shop Staff

```text
Get Started
-> Repair Shop
-> Shop Staff
-> invitation required
-> Sign in/Register
-> validate OWNER-authorized invite
-> create STAFF membership + consume invite atomically
```

No Staff Provider search or self-join is permitted.

---

## Auth context behavior

Required:

```text
0 valid memberships
-> NO_MEMBERSHIP

1 valid membership
-> ProviderContext

multiple memberships while active selection is unsupported
-> fail closed / AMBIGUOUS_PROVIDER_CONTEXT
```

Forbidden:

```text
missing membership
-> create Provider
-> create OWNER
```

Unexpected database/infrastructure failure must not be silently transformed into unauthenticated/no-context behavior.

---

## Staff invitation requirements

Staff invitation is:

```text
OWNER-authorized
Provider-bound
STAFF-bound
single-use
expiring
revocable
server-validated
preferably email-bound
stored by token hash
atomically consumed
```

No general authenticated INSERT into `provider_memberships` may permit self-authorization.

---

## Source-layout rework

Move application source to:

```text
src/app
src/features
src/components
src/lib
```

Do this as a dedicated structural change where practical.

Update only the configuration required by the move.

Do not leave competing root-level source directories.

---

## Migration rework

The development database is disposable.

Replace the current experimental Auth/Provider chain with a clean baseline.

Remove:

```text
unconditional auth signup -> Provider trigger
unsafe membership self-insert
patch-on-patch RLS workaround design
```

Support:

```text
providers
provider_memberships
provider_invitations
required Provider configuration
least-privilege RLS
```

Follow `Tracknologia_Supabase_Migration_Rules.md`.

---

## Scope cleanup

Remove from Feature 01 any fake or out-of-scope implementation of:

```text
Tracking
Repair Request submission
Repairs
Analytics metrics
future Module behavior
```

A minimal protected dashboard/smoke route is acceptable only to prove Auth/ProviderContext behavior.

---

## Required tests

```text
[ ] unauthenticated requireUser fails
[ ] missing membership fails closed
[ ] valid OWNER resolves correct ProviderContext
[ ] valid STAFF resolves correct ProviderContext
[ ] disallowed role fails
[ ] Independent OWNER onboarding works
[ ] Shop OWNER onboarding works
[ ] attacker cannot self-join another Provider
[ ] expired invitation is rejected
[ ] revoked invitation is rejected
[ ] consumed invitation cannot be reused
[ ] valid invitation creates exactly one STAFF membership
[ ] membership creation + invitation consumption are atomic
[ ] Provider A cannot access Provider B data
```

RLS/security cases require real PostgreSQL/Supabase-compatible integration tests, not only mocked clients.

---

## Re-review gate

```text
[ ] LD-01 onboarding implemented.
[ ] LD-02 src/ layout implemented.
[ ] LD-03 clean migration baseline implemented.
[ ] Migration rules followed.
[ ] Auth context lookup is read-only.
[ ] No arbitrary membership self-insert exists.
[ ] No unconditional Provider-on-signup trigger exists.
[ ] Staff onboarding is invitation-only.
[ ] No fake/out-of-scope feature surfaces remain.
[ ] Full migration chain succeeds from an empty database.
[ ] format/lint/typecheck/tests/build pass.
[ ] Actual verification evidence is included.
```

Return Feature 01 to Review only after these criteria are satisfied.
