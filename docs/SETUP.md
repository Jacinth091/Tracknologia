# Development Setup

This is the canonical setup guide for Tracknologia developers.

## Supported workflow

Docker is the default development environment so Windows and Linux developers use the same Node/runtime environment.

## Prerequisites

Required:

- Git
- Docker
- Docker Compose plugin

Recommended on Windows:

- WSL2
- Docker Desktop using the WSL2 backend

Node.js on the host is optional once Docker is configured.

### Verify

```bash
git --version
docker --version
docker compose version
```

## Clone

```bash
git clone <REPOSITORY_URL>
cd tracknologia
```

## Environment configuration

```bash
cp .env.example .env.local
```

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Required values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
PUBLIC_ABUSE_HMAC_SECRET=<at-least-32-random-characters>
```

`PUBLIC_ABUSE_TRUSTED_PROXY_SECRET` is also required as a different,
at-least-32-character random value when trusted ingress is in use. Local
development may leave it blank when `PUBLIC_ABUSE_SHARED_DEV_BUCKET=true`.

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It is required because public,
accountless operations (Tracking lookup, Tracking observation, Repair Request
submission) run under the service-role credential so the publishable key cannot
reach Postgres directly. Never expose it through a `NEXT_PUBLIC_*` variable or a
browser bundle. For local Supabase, `supabase status` prints the value.

`PUBLIC_ABUSE_HMAC_SECRET` creates opaque actor keys for the shared PostgreSQL
abuse control. Keep it server-only and identical across application instances.
Optional validated overrides are
`PUBLIC_ABUSE_TRACKING_LOOKUP_MAX`,
`PUBLIC_ABUSE_TRACKING_LOOKUP_WINDOW_SECONDS`,
`PUBLIC_ABUSE_REPAIR_REQUEST_MAX`,
`PUBLIC_ABUSE_REPAIR_REQUEST_WINDOW_SECONDS`, `PUBLIC_ABUSE_FEEDBACK_MAX`
(default `20`), and `PUBLIC_ABUSE_FEEDBACK_WINDOW_SECONDS` (default `600`).

Production also requires a trusted ingress and a separate
`PUBLIC_ABUSE_TRUSTED_PROXY_SECRET`, unless `PUBLIC_ABUSE_CLIENT_IP_SOURCE=vercel`
on Vercel (see [Deploying on Vercel](#deploying-on-vercel)). The ingress must remove any incoming
`x-tracknologia-proxy-secret` and `x-tracknologia-client-ip` values, set the
client-IP header itself, inject the proof secret, and block direct access to the
Next.js upstream. Do not reuse the HMAC secret as the proxy proof secret. The
application rejects public operations in production when proof or client-IP
metadata is missing or invalid.

The local Docker setup exposes Next.js without that trusted ingress. Local
development opts into one shared abuse-control bucket by setting
`PUBLIC_ABUSE_SHARED_DEV_BUCKET=true` in `.env.local`; forwarding headers are
ignored, so spoofed values cannot evade the limit. Any environment without
that opt-in requires valid trusted-ingress proof and fails closed otherwise,
so staging must configure the same ingress contract as production.

### Production Configuration Seam & Startup Validation

The application validates server configuration centrally via `src/lib/config/server.ts`.

In `production` (when `APP_ENV=production` or `APP_ENV=staging`):

- `NEXT_PUBLIC_APP_URL` must use `https://` and cannot use `localhost` or loopback IP addresses.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are mandatory.
- `RESEND_API_KEY` is mandatory and `RESEND_FROM_EMAIL` cannot use default `onboarding@resend.dev`.
- `PUBLIC_ABUSE_SHARED_DEV_BUCKET=true` and `NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION=false` throw validation errors at startup via Next.js `instrumentation.ts`.

`.env.local` must be ignored by Git.

## Deploying on Vercel

Vercel hosts the Next.js app directly, so no separate ingress is needed. Vercel
keeps Production, Preview and Development environment variables separate. A
variable set only for Production is not available to Preview deployments, so
each environment you deploy needs its own complete set. `VERCEL=1` is a system
variable that Vercel sets on both Preview and Production deployments. Do not
add it yourself.

Each environment needs these variables, scoped to that environment:

- `APP_ENV=production`
- `NEXT_PUBLIC_APP_URL`: the deployed `https://` URL of that environment
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for that environment's Supabase project
- `PUBLIC_ABUSE_HMAC_SECRET`: at least 32 random characters, unique to that environment
- `PUBLIC_ABUSE_CLIENT_IP_SOURCE=vercel`: reads each visitor's IP from Vercel's `x-vercel-forwarded-for` header. It is a configuration check, not proof of origin. Set it only on Vercel-served deployments, never on a self-hosted or other host; see the trust limit in `docs/SECURITY.md`.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL`: a verified sender address, not `onboarding@resend.dev`

Do not set `PUBLIC_ABUSE_TRUSTED_PROXY_SECRET`; this mode does not use it.
Never set `PUBLIC_ABUSE_SHARED_DEV_BUCKET` or
`NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION=false`. Production rules, which Preview
deployments also follow, reject both at startup.

Vercel bakes `NEXT_PUBLIC_*` values into the build, so redeploy after you change
them.

### Preview: the #109 acceptance check

Run the acceptance check on a Preview deployment backed by a separate, free
**test** Supabase project, so pilot data stays clean. Running it against
Production instead needs the owner's explicit approval.

1. Link the repo to the test project and apply every migration:

   ```bash
   npx supabase link --project-ref <test-ref>
   npx supabase db push
   ```

2. Set the variables above with the **Preview** scope, using the test project's values. Set `NEXT_PUBLIC_APP_URL` to the branch's stable Preview URL, `https://<project>-git-<branch>-<scope>.vercel.app`.
3. In the test project's Supabase Authentication → URL Configuration, set the Site URL to that Preview URL, and add `<preview-url>/auth/callback` to the redirect URLs.
4. Vercel Deployment Protection may require you to be signed in to Vercel to open the Preview URL.

Each Vercel deployment page shows the Git commit it was built from. Use the
deployment at the PR's exact head SHA, and confirm that SHA before you test.

Smoke and anti-spoof checklist, run on the Preview:

- A Tracking lookup with a real tracking code shows the Repair.
- A Repair Request submitted from a Provider's public page succeeds.
- Feedback submission succeeds.
- **Throttle:** from one device, the 21st feedback submission within 10 minutes is throttled (default `PUBLIC_ABUSE_FEEDBACK_MAX=20`).
- **Spoof:** repeat the throttle check with a browser header extension, such as ModHeader, adding forged `x-vercel-forwarded-for`, `x-forwarded-for`, `x-real-ip` and `x-tracknologia-client-ip` values. It must still throttle at the 21st submission.
- **Isolation:** from a second device on a different network, such as a phone on mobile data, a submission still succeeds while the first device is throttled.

Record pass or fail, the deployed SHA and the date only. Do not record IP
addresses, tracking codes or personal data.

### Production: the pilot

Set the same variables with the **Production** scope. Point them at the pilot
Supabase project, and set `NEXT_PUBLIC_APP_URL` to the production URL. In the
pilot project's Supabase Authentication → URL Configuration, set the Site URL
to the production URL, and add `<app-url>/auth/callback` to the redirect URLs.

Never put real participant data in a Preview deployment.

## Start the application

First run:

```bash
docker compose up --build
```

Normal runs:

```bash
docker compose up
```

Application:

```text
http://localhost:3000
```

Stop:

```bash
docker compose down
```

## Dependency commands

Install repository dependencies from the lockfile:

```bash
pnpm install
```

Add a runtime dependency:

```bash
pnpm add <package>
```

Add a development dependency:

```bash
pnpm add -D <package>
```

Commit both `package.json` and `pnpm-lock.yaml` when dependencies change.

## Quality commands

```bash
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
```

## End-to-end (Playwright) testing

E2E runs on the host machine and in GitHub Actions only — not inside the Docker
dev container (the Alpine development image does not install Playwright
Chromium/system dependencies).

Run the suite with `pnpm test:e2e`. Before running it:

1. Install the Chromium browser once:
   ```bash
   pnpm exec playwright install --with-deps chromium
   ```
2. Start a **local** Supabase stack and point `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` at it
   (`supabase start` prints the local values). Reset the database first:
   ```bash
   supabase start
   pnpm db:reset
   ```
   The committed `supabase/config.toml` starts only the services the test
   suites need (Postgres, Auth, REST, gateway; issue #80), so no extra flags
   are required.
   The fixtures seed and delete actors/tenants via the service-role key, so
   they refuse to run against anything but a local `localhost`/`127.0.0.1`
   stack — never production or shared mutable data.
3. Optionally set `E2E_BASE_URL` to the app URL. When omitted, Playwright's
   `webServer` starts the app in dev mode at `http://localhost:3000`.

The suite must stay deterministic: no arbitrary sleeps, each scenario owns and
cleans up its data, retries are disabled by policy, and a flaky
release-critical test is a defect rather than something to normalize with
reruns.

## Supabase & Database Migrations

Each development environment connects to the Tracknologia Supabase project.

The application uses:

- Supabase Auth;
- PostgreSQL;
- Least-privilege RLS policies;
- `@supabase/supabase-js`;
- `@supabase/ssr`.

### Applying Migrations

1. Link to the development project (one time):
   ```bash
   npx supabase link --project-ref <project-ref>
   ```
2. Push migrations:
   ```bash
   npx supabase db push
   ```

Do not place service-role/secret keys in public browser environment variables.

Never commit `supabase/.temp/` CLI state.

### Internal operator access

`20261029090000_add_internal_operator_access.sql` creates private
`internal_operators` and `internal_access_audit` tables plus service-role-only
functions. It seeds no identities: after migration, ordinary accounts, Provider
OWNERs, and staff still have no `/internal` access.

Provisioning and revocation are manual, owner-approved operations documented in
`docs/OPERATIONS.md`. Use the service-role credential locally only with
disposable test identities; the E2E/DB fixtures create and delete those
identities themselves.

## Native Node fallback

Docker is canonical. If a developer temporarily needs to run the application directly on the host, use the Node major version documented by the repository and run:

```bash
pnpm install
pnpm dev
```

A problem that occurs only outside the Docker environment is not sufficient evidence that the repository's canonical setup is broken.
