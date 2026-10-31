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

## Core workflow — password recovery

Supabase Auth owns recovery tokens and email delivery. Tracknologia owns the
routing and the deliberate recovery states:

```text
Account holder opens /forgot-password with a sign-in email
        ↓
Auth Module requestPasswordReset → Supabase Auth resetPasswordForEmail
(callback target: <origin>/auth/callback?next=/reset-password)
        ↓
Supabase Auth emails the recovery link to the account's sign-in email
(unknown accounts are silently skipped; the UI confirms neutrally). The default
link is Supabase's own verify endpoint, /auth/v1/verify?type=recovery, whose
redirect_to returns to /auth/callback?next=/reset-password
        ↓
The visitor opens the verify link in the same browser that requested the reset
(the PKCE verifier cookie lives there). Supabase verifies the token and redirects
to /auth/callback?code=…, which exchanges the code for a session
        ↓
/auth/callback checks the redeemed session's access-token amr claim. It issues
the recovery grant only when amr names method "recovery" with a recent
timestamp. The grant is a signed HttpOnly cookie for /reset-password, bound to
the Auth user and the session id, valid for 10 minutes
        ↓
The callback redirects to /reset-password?flow=recovery, or to
/reset-password?callback_error=auth_callback_failed when the code, the amr or the
session is not a recovery
        ↓
The reset page resolves state server-side (Auth Module getUser() and the
session id):
- no session                         → "Recovery link required" card, fresh-link CTA
- session, flow marker, no grant     → "Recovery link required" card (expired or missing)
- session, flow marker, valid grant  → password form, naming the account by masked email
- session, no flow marker            → redirect /dashboard (ordinary signed-in visit)
        ↓
updatePasswordAction checks the signed-in user and session against the grant,
then Auth Module resetPassword → Supabase Auth updateUser({ password }). On
success the browser's grant cookie is cleared
        ↓
Post-reset destination: /dashboard (the exchange established a signed-in session)
```

Rules the workflow depends on:

- `proxy.ts` keeps `/forgot-password` and `/reset-password` reachable for
  signed-in visitors (proxy-time session refresh still runs) and only
  redirects signed-in visitors away from `/login` and `/register`. Recovery
  entry pages resolve their own state; an automatic redirect there would
  strand a valid recovery session on the dashboard.
- The `?flow=recovery` marker is a navigation hint only. On its own it
  authorizes nothing: the form opens and the password changes only with a valid
  recovery grant for the signed-in user and session. A plain signed-in visit
  without the marker goes to /dashboard. No application reset-token table
  exists; Supabase Auth credentials own the mechanism.
- The grant is short-lived (10 minutes), user- and session-bound, and cleared by
  the browser after a successful change. It is not an atomic server-side spent
  token: a copied cookie stays usable from the same session until it expires.
- A recovery exchange replaces any existing session with the recovery
  account's session. Each person recovers their own account; a Staff member
  must use their own sign-in email, never the Shop Owner's.
- Editing the Provider's customer contact email never affects sign-in
  credentials or recovery delivery; recovery emails always go to the
  sign-in email shown in the settings Account & Security area. The sign-in
  email and the Provider's customer/public contact email are distinct
  domain concepts.
- The reset request response is neutral: it never reveals whether an email
  is registered, and production Auth failures are never surfaced as raw
  errors. Expired, reused, or missing recovery credentials lead to the
  deliberate recovery screen with a fresh-link request path, even for a
  signed-in visitor. A failed recovery callback lands on
  /reset-password?callback_error=auth_callback_failed. A failed sign-in
  callback (not a recovery) still lands on /login with a useful message.

## Security requirements

Staff signup creates only the authenticated account, with email and password.
The invitation code is entered during onboarding, where Providers validates and
accepts the invitation before granting membership. Shared invitation links still
preselect Staff and carry their code through the existing HttpOnly onboarding
cookie; the registration form does not ask the user to paste a code.

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
- allowed roles pass and disallowed roles fail with `UNAUTHORIZED_ROLE`;
- password recovery keeps its deliberate routing contract: recovery sessions
  reach `/reset-password`, the marker-less signed-in visit does not open the
  reset form, the reset-request response is neutral, production Auth
  failures do not leak raw messages, and stale/failed callback exchanges
  recover on the login page (`tests/contracts/auth-proxy.contract.test.ts`,
  the `(auth)` action/page/route tests, and
  `tests/e2e/password-recovery.spec.ts` against a disposable local stack).
