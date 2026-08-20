# Feature — Auth / Provider Access

**Code location:** `src/features/auth/`

## Description

The Auth / Provider Access feature establishes **who the authenticated Provider User is and which Repair Provider they are authorized to act for**.

Supabase Auth handles authentication mechanics (user credentials, email confirmation, password recovery, session tokens). Tracknologia remains responsible for application authorization through Provider membership and role information.

## Primary goal

Provide every protected feature with a small, trusted, read-only authorization context (`ProviderContext`) so business Modules do not reimplement session, membership, and role resolution independently.

## Feature goals

- Resolve the current authenticated user reliably (`getUser()`, `requireUser()`).
- Resolve the user's Provider membership into a trusted `ProviderContext` (`getProviderContext()`, `requireProviderContext()`).
- Support `OWNER` and `STAFF` membership roles without assuming every Provider has multiple people.
- Support Independent Repairers and one-person Repair Shops where the owner is also the working technician.
- **Fail closed** when authentication or membership is missing or invalid (`NO_MEMBERSHIP`, `AMBIGUOUS_PROVIDER_CONTEXT`). Never silently manufacture business entities during context lookup.
- Keep Supabase session/membership lookup details behind a small Interface.
- Prevent routes and browser inputs from becoming the source of truth for Provider identity or role.

## Non-goals

The MVP Auth feature does **not** own:

- Customer accounts;
- Provider profile editing (owned by Providers);
- Staff invitation generation (owned by Providers);
- Technician scheduling or complex permission matrices;
- Repair lifecycle or tracking behavior.

## Main actors

- **Provider User** — authenticated human acting for a Provider (`OWNER` or `STAFF`).
- **Supabase Auth** — authentication mechanism, not the Tracknologia authorization model.

Customers do not authenticate in the MVP.

## Domain concepts

### Provider User

An authenticated person authorized to act for a Provider.

### Provider Membership

Associates a Supabase user identity with a Tracknologia Provider and role (`OWNER` or `STAFF`).

### ProviderContext

A trusted runtime representation containing:

```text
userId
providerId
providerName
providerType
role
email
```

## Public Interface (`src/features/auth/index.ts`)

```ts
requireUser(): Promise<AuthenticatedUser>
getUser(): Promise<AuthenticatedUser | null>
requireProviderContext(): Promise<ProviderContext>
getProviderContext(): Promise<ProviderContext | null>
requireProviderRole(allowedRoles: ProviderRole[]): Promise<ProviderContext>
loginWithPassword(credentials: LoginInput): Promise<AuthSession>
registerProviderAccount(params: RegisterInput): Promise<AuthResult>
requestPasswordReset(params: { email: string; redirectTo?: string }): Promise<void>
resetPassword(params: { newPassword: string }): Promise<void>
signOutUser(): Promise<void>
```

## Core workflow — protected operation

```text
Provider User opens protected route/action
        ↓
Read Supabase authenticated identity (requireUser)
        ↓
Find valid provider_memberships (fail closed if 0 or ambiguous > 1)
        ↓
Create trusted ProviderContext
        ↓
Feature operation receives ProviderContext
        ↓
Feature authorizes Provider-owned resource
```

## Routes and UI (`src/app/(auth)/`)

```text
src/app/(auth)/
├── login/
├── register/
├── forgot-password/
├── reset-password/
├── confirmed/
└── actions.ts (Next.js Server Actions adapter)
```

## Security requirements

- Do not trust client-supplied `userId`, `providerId`, or `role` when they can be derived from the authenticated session.
- A valid Supabase session is not sufficient authorization by itself.
- Provider ownership must be checked server-side.
- PostgreSQL RLS reinforces Provider isolation (no direct client membership inserts).
- `proxy.ts` may redirect/session-refresh but is not the sole authorization mechanism.
- Privileged Supabase keys remain server-only.

## Testing expectations

At minimum test:

- unauthenticated calls fail with `UNAUTHENTICATED`;
- missing membership fails closed with `NO_MEMBERSHIP`;
- multiple memberships without active selection fail closed with `AMBIGUOUS_PROVIDER_CONTEXT`;
- valid membership resolves correct Provider context for both `OWNER` and `STAFF`;
- Independent Repairer context resolves correctly;
- allowed roles pass and disallowed roles fail with `UNAUTHORIZED_ROLE`.
