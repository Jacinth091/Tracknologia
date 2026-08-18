# Feature — Auth / Provider Access

**Code location:** `src/features/auth/`

## Description

The Auth / Provider Access feature establishes **who the authenticated Provider User is and which Repair Provider they are authorized to act for**.

Supabase Auth handles authentication mechanics. Tracknologia remains responsible for application authorization through Provider membership and role information.

## Primary goal

Provide every protected feature with a small, trusted authorization context so business Modules do not reimplement session, membership, and role resolution independently.

## Feature goals

- Resolve the current authenticated user reliably.
- Resolve the user's Provider membership into a trusted `ProviderContext`.
- Support `OWNER` and `STAFF` membership roles without assuming every Provider has multiple people.
- Support a one-person Repair Shop where the owner is also the working technician.
- Fail closed when authentication or membership is missing/invalid.
- Hide Supabase session/membership lookup details behind a small Interface.
- Prevent routes and browser inputs from becoming the source of truth for Provider identity or role.

## Non-goals

The MVP Auth feature does **not** own:

- Customer accounts;
- technician scheduling;
- a complex permission matrix;
- branch-level authorization;
- Repair lifecycle behavior;
- Repair Request state changes;
- staff productivity/workload management.

## Main actors

- **Provider User** — authenticated human acting for a Provider.
- **Supabase Auth** — authentication mechanism, not the Tracknologia authorization model.

Customers do not authenticate in the MVP.

## Domain concepts

### Provider User

An authenticated person authorized to act for a Provider.

### Provider Membership

Associates a Supabase user identity with a Tracknologia Provider and role.

### ProviderContext

A trusted runtime representation containing at minimum:

```text
userId
providerId
role
```

It may contain additional safe context when implementation requires it, but callers should not need to understand Supabase session internals.

## Conceptual Interface

```ts
requireUser(): AuthenticatedUser
requireProviderContext(): ProviderContext
requireProviderRole(roles): ProviderContext
```

These names are conceptual. Keep the actual Interface small rather than expanding it into many nearly identical helpers.

## Core workflow — protected operation

```text
Provider User opens protected route/action
        ↓
Read Supabase authenticated identity
        ↓
Find valid provider_membership
        ↓
Create trusted ProviderContext
        ↓
Feature operation receives ProviderContext
        ↓
Feature authorizes Provider-owned resource
```

## Routes and UI

Typical routes:

```text
/login
/register
/forgot-password
```

Framework-specific callback routes may exist as required by the installed Next.js/Supabase versions.

Auth UI should remain focused on authentication. Do not place Provider/Repair business logic inside login/register forms.

## Data used

- Supabase-managed `auth.users`;
- `provider_memberships`.

The Auth feature interprets memberships for access control. Provider business profile data remains the responsibility of the Providers feature.

## Relationships with other features

### Providers

Provider onboarding may need to establish the first `OWNER` membership after creating a Provider. Keep this orchestration explicit; do not make Provider profile code responsible for session mechanics.

### Repair Requests

Protected Request review/accept/decline requires `ProviderContext`.

### Repairs

All Provider-side Repair reads/mutations require `ProviderContext`.

### Tracking

Public Tracking does not require Provider authentication.

## Security requirements

- Do not trust client-supplied `userId`, `providerId`, or `role` when they can be derived from the authenticated session.
- A valid Supabase session is not sufficient authorization by itself.
- Provider ownership must be checked server-side.
- PostgreSQL RLS should reinforce Provider isolation.
- `proxy.ts` may redirect/session-refresh but must not be the sole authorization mechanism.
- Privileged Supabase keys remain server-only.

## Important scenarios

### One-person Shop

```text
Provider: ABC Repair
Type: SHOP
Memberships:
  Juan → OWNER
```

This is valid. No separate technician record is required.

### User attempts another Provider's Repair

A user changes `/dashboard/repairs/<id>` manually to another Provider's Repair id.

Expected result:

- route id does not grant access;
- feature ownership check fails;
- RLS also prevents unauthorized data access.

## Failure behavior

Expected failures include:

- unauthenticated;
- authenticated but no valid Provider membership;
- insufficient role for a role-restricted operation;
- resource belongs to another Provider.

Do not silently fall back to a caller-supplied Provider id.

## Testing expectations

At minimum test:

- unauthenticated calls fail;
- valid membership resolves correct Provider context;
- invalid/missing membership fails;
- Provider A cannot act on Provider B resources;
- allowed roles pass and disallowed roles fail;
- one-person Provider configuration works without a Staff member.

## Definition of done

The feature is healthy when other protected Modules can obtain trusted Provider identity/role information through a small Interface without knowing how Supabase session or membership persistence works.
