# 15 — Security and Privacy

## Security model

Tracknologia does not rely on Next.js alone for security. Use layered enforcement:

```text
Next.js request/server surface (src/app)
        ↓
Supabase Auth (identity/session)
        ↓
Tracknologia authorization (Provider membership/business rules in src/features/auth/)
        ↓
PostgreSQL Row Level Security
        ↓
Database
```

## Authentication versus authorization

### Supabase Auth owns authentication

Supabase handles identity/session mechanics such as login, passwords, sessions, token issuance/refresh, and password reset.

Tracknologia does not implement password hashing or custom JWT authentication.

### Tracknologia owns authorization

Authentication only proves who the user is. Tracknologia must still determine:

- which Provider the user may act for;
- membership role (`OWNER` | `STAFF`);
- whether the Provider owns a Repair/Request;
- whether the requested business operation is allowed.

Centralize this through `src/features/auth/` rather than repeating ad hoc checks in pages. Authorization must **fail closed** (`NO_MEMBERSHIP`, `AMBIGUOUS_PROVIDER_CONTEXT`) and never mutate business state during read lookups.

## Row Level Security

Enable RLS on Provider-owned application tables exposed through Supabase.

Core invariants:

> A user belonging to Provider A cannot read or mutate Provider B's Provider data, Repair Requests, Repairs, status history, updates, or invitations.

> Direct client INSERT/UPDATE/DELETE on `provider_memberships` is strictly prohibited. Memberships must only be created via authorized atomic `SECURITY DEFINER` procedures (Owner onboarding / Staff invitation acceptance).

Application authorization remains required even with RLS. RLS is defense in depth, not a replacement for domain checks.

## Staff Invitation Security (LD-01)

Every Staff invitation is:

- created only by an authorized Provider `OWNER`;
- bound to exactly one Provider;
- single-use;
- expiring (7-day default);
- revocable by an OWNER;
- stored by token hash, never raw token;
- consumed atomically with `STAFF` membership creation via `accept_staff_invitation` RPC.

## Server Actions and Route Handlers

Treat every mutation interface as externally callable.

Each sensitive operation must:

1. resolve/verify authenticated user;
2. resolve Provider context;
3. validate input with Zod;
4. verify object ownership/business rule;
5. perform persistence transaction.

Do not assume a hidden button or protected page makes a Server Action authorized.

## Proxy usage

Current Next.js uses `proxy.ts` terminology. Use Proxy for session refresh and coarse navigation/redirect behavior only.

Do not put the full Tracknologia authorization model in Proxy.

## Server-only code

Use `server-only` for sensitive persistence/auth implementation modules where useful to prevent accidental client imports:

- `src/features/repairs/persistence.ts`
- `src/features/auth/context.ts`
- `src/features/auth/persistence.ts`
- `src/lib/supabase/server.ts`

## Input validation

Use Zod on the server for:

- Repair Request submission;
- direct Repair creation;
- Repair acceptance verification;
- status transitions;
- Provider profile changes;
- Tracking Code lookup shape/limits.

Browser validation is UX only.

## Public tracking

Tracking Codes must be difficult to enumerate. Do not use sequential Ticket Numbers as the public credential.

Public lookup returns a dedicated `PublicRepairView`, never a complete Repair row.

Never expose:

- Internal Notes;
- customer contact fields unless explicitly required in the view;
- raw internal database ids;
- Provider-private information;
- privileged audit data.

Apply rate limiting to public lookup before real public exposure.

## Secrets

Never expose Supabase secret/service-role credentials to the browser or prefix them with `NEXT_PUBLIC_`.

Browser-safe public/publishable configuration is distinct from privileged server credentials.

`.env.local` is never committed. Commit only `.env.example` with names/placeholders.

## Required security tests

- Provider A cannot read Provider B Repair.
- Provider A cannot mutate Provider B Repair.
- Provider A cannot accept Provider B Request.
- User B cannot self-assign membership to Provider A (tenant takeover prevention).
- Expired, revoked, or consumed staff invitations cannot be accepted.
- unauthenticated user cannot access Provider-owned operations.
- valid Tracking Code returns only public projection.
- invalid Tracking Code reveals minimal information.
- Internal Notes never enter public output.
- repeated Request acceptance cannot create duplicate Repairs.
- status transitions cannot bypass allowed business rules.
