# Tracknologia Lead Decisions Handoff

**Status:** APPROVED / LOCKED  
**Date:** 2026-08-20  
**Owner:** Technical Lead  
**Applies to:** Feature 01 Auth / Provider Access, Feature 02 Providers, repository structure, Supabase schema/migrations, and subsequent feature branches.

## Decision Summary

| ID | Decision | Final Ruling |
|---|---|---|
| **LD-01** | Provider onboarding and Staff access | Independent Repairers and Shop Owners create Providers. Shop Staff may join only through an OWNER-authorized secure invitation. |
| **LD-02** | Canonical source layout | All application source code belongs under `src/`: `src/app`, `src/features`, `src/components`, and `src/lib`. |
| **LD-03** | Current migration history | Reset the disposable development Supabase database and re-author the experimental Auth/Provider migrations into a clean baseline. |

These decisions are mandatory unless later superseded by an explicit Lead decision or accepted ADR.

---

# LD-01 — Provider Onboarding and Staff Access

## Final decision

Tracknologia has three controlled onboarding paths:

```text
GET STARTED
    |
    +-- Independent Repairer
    |       |
    |       v
    |   Create/authenticate User
    |       |
    |       v
    |   Independent Provider onboarding
    |       |
    |       v
    |   Create INDEPENDENT Provider
    |       +
    |   Create OWNER membership
    |
    +-- Repair Shop
            |
        +---+---+
        |       |
        v       v
    Shop Owner  Shop Staff
        |          |
        |          +--> Invitation required
        |                   |
        |                   v
        |              Sign in / Register
        |                   |
        |                   v
        |              Validate invitation
        |                   |
        |                   v
        |              Create STAFF membership
        |                   +
        |              Consume invitation
        |
        v
    Create/authenticate User
        |
        v
    Shop Provider onboarding
        |
        v
    Create SHOP Provider
        +
    Create OWNER membership
```

## Domain separation

Provider type and membership role are distinct:

```text
Provider Type
- SHOP
- INDEPENDENT

Membership Role
- OWNER
- STAFF
```

An Independent Repairer is a Provider of type `INDEPENDENT`. The authenticated User who establishes that Provider becomes its initial `OWNER` internally.

A Shop Owner creates a `SHOP` Provider and becomes its initial `OWNER`.

A Shop Staff user never creates a Provider.

## Independent Repairer onboarding

The Independent flow may collect information appropriate to independent operation:

- display name / repair brand;
- contact information;
- Service Area;
- supported device categories;
- supported Service Modes;
- optional public address or meetup information;
- description/profile information.

Do not force Shop-specific assumptions such as a mandatory physical-store address.

Creation of the Provider and initial OWNER membership must be atomic.

```text
Authenticated User
        |
        v
Validate Independent onboarding
        |
        v
Create Provider: INDEPENDENT
        +
Create membership: OWNER
        |
        v
Commit once
```

## Shop Owner onboarding

The Shop Owner flow may collect:

- Shop/business name;
- Shop contact information;
- public Shop address where applicable;
- Service Area;
- supported devices;
- supported Service Modes;
- description/profile information;
- accepting-Repair-Requests configuration.

Creation of the Shop Provider and initial OWNER membership must be atomic.

```text
Authenticated User
        |
        v
Validate Shop onboarding
        |
        v
Create Provider: SHOP
        +
Create membership: OWNER
        |
        v
Commit once
```

## Shop Staff onboarding

### Hard invariant

> **Shop Staff cannot search for, discover, select, claim, or self-join a Provider.**

There is no public "search for my Shop and join" flow.

A Staff membership can only be created through an OWNER-authorized invitation for an already-existing `SHOP` Provider.

If the Shop does not yet exist in Tracknologia, the Shop Owner must onboard it first.

## Staff invitation security requirements

Every Staff invitation must be:

- created by an authorized Provider `OWNER`;
- bound to exactly one Provider;
- bound to `STAFF` for the MVP;
- cryptographically difficult to guess;
- single-use;
- expiring;
- revocable by an OWNER;
- validated server-side;
- consumed atomically with membership creation;
- preferably bound to the intended Staff email;
- persisted by token hash, not raw token.

The browser must not be authoritative for:

```text
providerId
role
invitedByUserId
```

### Recommended conceptual relation

```text
provider_invitations

id
provider_id
email
role
token_hash
invited_by_user_id
created_at
expires_at
accepted_at
accepted_by_user_id
revoked_at
```

For MVP, invitations create `STAFF` memberships only. OWNER transfer is a separate future decision.

## Auth versus Provider onboarding

Supabase Auth owns credential/session mechanics.

Tracknologia owns Provider creation and Provider membership authorization.

`requireProviderContext()` is a read-only authorization operation. It must never create a Provider or membership.

```text
requireProviderContext()
        |
        v
authenticated?
   no ------> UNAUTHENTICATED
   |
  yes
   |
   v
find valid membership
   |
   +-- none --> NO_MEMBERSHIP
   |
   +-- one --> ProviderContext
   |
   +-- ambiguous and active selection unsupported
             --> fail closed
```

## Prohibited implementations

Do not implement:

```text
auth.users INSERT
        |
        v
automatically create Provider
        |
        v
automatically create OWNER membership
```

Do not implement:

```text
Staff
 |
 v
search/select Provider
 |
 v
self-create membership
```

Do not make a Shop Owner create Staff passwords. Staff own their Supabase Auth credentials; the invitation authorizes membership only.

---

# LD-02 — Canonical `src/` Source Layout

## Final decision

All Tracknologia application source code must live under `src/`.

```text
Tracknologia/
|-- src/
|   |-- app/
|   |   |-- (public)/
|   |   |-- (auth)/
|   |   `-- (provider)/
|   |-- features/
|   |   |-- auth/
|   |   |-- providers/
|   |   |-- repair-requests/
|   |   |-- repairs/
|   |   |-- tracking/
|   |   `-- analytics/
|   |-- components/
|   |   |-- ui/
|   |   `-- shared/
|   `-- lib/
|       `-- supabase/
|-- supabase/
|   `-- migrations/
|-- public/
|-- docs/
|-- proxy.ts
|-- package.json
`-- next.config.ts
```

After the structural migration, competing root-level application folders must not remain:

```text
/app
/features
/components
/lib
```

## Dependency direction

```text
src/app
   |
   v
src/features
   |
   v
persistence / infrastructure adapters
   |
   v
Supabase / PostgreSQL
```

`src/app` owns Next.js routing and adaptation.

`src/features/<capability>` owns business Modules and their Interfaces.

`src/components` owns shared UI primitives/cross-feature visuals.

`src/lib` contains narrow infrastructure glue, not business behavior.

## Why this is being corrected now

The accepted architecture already establishes `src/features/<capability>/` as the canonical home of Tracknologia business Modules, while implementation began at repository root.

Leaving the discrepancy would create:

- inconsistent imports;
- ambiguous file ownership;
- different conventions per developer;
- documentation drift;
- avoidable merge conflicts;
- a larger migration cost after all six Modules are populated.

The repository is still early enough to correct the structure with low cost.

## Implementation rule

Perform the layout move as a dedicated structural change, preferably:

```text
chore/source-layout
```

Expected moves:

```text
app/        -> src/app/
features/   -> src/features/
components/ -> src/components/
lib/        -> src/lib/
```

Only configuration changes required by the move should accompany it, such as TypeScript aliases, shadcn/component paths, CSS path configuration, or include paths.

Do not combine this structural move with:

- Auth redesign;
- database redesign;
- UI redesign;
- unrelated refactors;
- new feature work.

## Enforcement

> **New Tracknologia application source must not be introduced outside `src/`. Mixed root/`src` layouts are prohibited.**

PR checklist:

```text
[ ] No root-level app/features/components/lib source directory was introduced.
[ ] Next.js route/application code is under src/app.
[ ] Business Modules are under src/features/<capability>.
[ ] Shared UI is under src/components.
[ ] Infrastructure helpers are under src/lib.
[ ] Dependency direction remains app -> Modules -> persistence/infrastructure.
[ ] No unrelated refactor is hidden inside a source-layout PR.
```

---

# LD-03 — Clean Supabase Migration Baseline

## Final decision

The current Supabase environment contains disposable development/test data.

The current experimental Auth/Provider migration chain is not preserved as permanent migration history.

The development database is authorized for reset and the migrations must be re-authored into a clean, reviewed baseline implementing the accepted domain/security model.

## Why Option A is necessary

The current migration chain reflects development debugging rather than an accepted schema evolution:

```text
create Auth/Provider schema
        |
        v
fix signup trigger
        |
        v
add insert RLS policies
        |
        v
fix RLS recursion
```

It also encodes rejected behavior:

- automatic Provider creation for every Auth signup;
- unsafe user-controlled membership insertion;
- patch-on-patch RLS changes.

Because the current rows are test/development data and reproducible, retaining this chain would preserve technical debt without preserving valuable business state.

## Approved reset process

```text
Coordinate reset
    |
    v
Discard disposable development/test rows
    |
    v
Remove/re-author unaccepted experimental migrations
    |
    v
Create clean approved baseline
    |
    v
Apply all migrations to an empty database
    |
    v
Run schema + RLS/security tests
    |
    v
Lead review
    |
    v
Accept shared baseline
    |
    v
Migration files become immutable
```

The replacement baseline must implement LD-01:

```text
auth.users
    |
    `-- authentication identity only

Independent onboarding
    -> INDEPENDENT Provider + OWNER membership

Shop Owner onboarding
    -> SHOP Provider + OWNER membership

Shop Staff onboarding
    -> valid OWNER-authorized invitation
    -> existing SHOP Provider + STAFF membership
```

There must be no unconditional signup trigger creating Providers for all `auth.users`.

## Migration immutability point

Before acceptance, a migration may be revised only while:

- the feature is under development;
- the migration has not become an accepted shared baseline;
- every environment using it is explicitly disposable.

After Lead acceptance into a preserved shared environment:

```text
existing migration
    |
    v
IMMUTABLE

future correction
    |
    v
new forward migration
```

The full operational ruling is defined in `Tracknologia_Supabase_Migration_Rules.md`.

---

# Cross-Decision Implementation Direction

```text
LD-01: explicit onboarding/invitations
                |
                v
LD-03: clean DB baseline without auto-provision trigger
                |
                v
LD-02: clean src/ Module structure
```

Target:

```text
src/app
    |
    v
src/features/auth
    |-- identity/session
    `-- ProviderContext resolution
            |
            v
src/features/providers
    |-- create Independent Provider
    |-- create Shop Provider
    |-- create/revoke Staff invitations
    `-- accept Staff invitation
            |
            v
Supabase/PostgreSQL
    |-- providers
    |-- provider_memberships
    |-- provider_invitations
    `-- RLS/constraints
```

---

# Required Documentation Reconciliation

Update the authoritative project docs where affected:

```text
CONTEXT.md
docs/features/00_FEATURE_INTEGRATION_MAP.md
docs/features/01_AUTH.md
docs/features/02_PROVIDERS.md
docs/10_MODULES.md
docs/11_SYSTEM_ARCHITECTURE.md
docs/13_DATA_MODEL.md
docs/14_INTERFACE_CONTRACTS.md
docs/15_SECURITY_AND_PRIVACY.md
docs/17_TESTING_STRATEGY.md
docs/22_REPOSITORY_STRUCTURE.md
docs/26_DATABASE_SCHEMA_DRAFT.md
relevant ADRs and engineering references
```

`CONTEXT.md` must contain domain vocabulary/relationships only, not migration/framework implementation detail.

---

# Routing

**Decision status:** LOCKED  
**Routing:** RETURN TO DEV for Auth rework, source-layout correction, and database reset/re-baseline  
**Re-review:** Only after the three Lead decisions and migration rules are satisfied.
