# Testing Strategy

Tracknologia prioritizes tests around business invariants and critical user flows.

## Layers

### Module tests — Vitest

Test feature interfaces directly without rendering UI where possible.

High-value examples:

- new Repair starts `IN_PROGRESS`;
- Provider cannot mutate another Provider's Repair;
- accepted Repair Request creates at most one Repair;
- declined Request creates no Repair;
- `COMPLETED` Repair rejects unsupported transitions;
- public tracking projection excludes private fields;
- successful Tracking records one minimal analytics observation;
- the Tracking action returns before an unresolved deferred Analytics task;
- Analytics failure does not log the credential/database detail;
- the internal-operator guard denies missing/disabled mappings and Provider
  roles, fails closed on Auth/database/audit faults, and the sensitive audit
  path re-runs the guard and appends only the fixed category for the verified
  operator.

### Rendered UI contracts — Vitest

`tests/contracts/brand-ui.contract.test.tsx` uses the installed React DOM server
renderer to check status illustrations, accessible names, current navigation,
tracking outcomes and URL prefill, Request receipts, and native account radios.
It supplies action results at the rendering seam; it does not exercise browser
events, real Server Action transport, responsive layout, or computed styles.

Avoid testing implementation details or Tailwind class strings unless they are functionally significant.

### End-to-end tests — Playwright

Run with `pnpm test:e2e` (or `pnpm exec playwright test`). The suite lives under
`tests/e2e/` and drives the real UI against the supplied Supabase project. It
sits on top of the module, contract, and integration layers; it does not replace
them.

Environment (see `.env.example` and the fixtures in `tests/e2e/helpers/`):

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the
  public Supabase credentials of a **local** Supabase stack.
- `SUPABASE_SERVICE_ROLE_KEY` — required so fixtures can seed and clean up test
  actors/tenants. The fixtures refuse any host other than
  `localhost`/`127.0.0.1`/`::1`: destructive seeding is local/disposable-only,
  never production or shared mutable data. Start the stack with `supabase
start` and run `pnpm db:reset` before the suite.
- `E2E_BASE_URL` — the app URL. Defaults to the Playwright `webServer`
  (`http://localhost:3000`), which starts the app in dev mode (some flows, such
  as E2E-06 registering staff through the live form, require `runtime=local`).

Mandatory release scenarios (one spec file each under `tests/e2e/`):

1. `direct-repair.spec.ts` — Provider login, create Repair, `IN_PROGRESS`,
   tracking code, public customer tracking, status updates, `READY`,
   `COMPLETED`.
2. `customer-request.spec.ts` — public Provider page, submit Request, Provider
   accepts, exactly one `CUSTOMER_REQUEST` Repair starting `IN_PROGRESS`,
   tracking code, public Tracking through the real `/track` UI, and replay
   resistance (acceptance action is not available again and creates no second
   Repair).
3. `one-person-shop.spec.ts` — a single SHOP OWNER completes the full Repair
   workflow with no artificial technician requirement.
4. `independent-repairer.spec.ts` — Independent Provider registers and onboards
   through the real UI with Service Area + Meetup/Home Service, no mandatory
   shop address, then operates a normal non-shop-mode Repair.
5. `cross-tenant.spec.ts` — Provider A cannot read **or mutate** Provider B's
   protected data; B's durable Repair state is unchanged after A's attempts.
6. `staff-lifecycle.spec.ts` — OWNER invites, Staff accepts, gets permitted
   access, owner-only controls are denied, OWNER removes Staff, access is
   denied.

Reliability rules:

- Never use arbitrary sleeps; wait on observable application states.
- Each test owns and deterministically cleans up its data (fixtures seed and
  remove every actor/provider it creates).
- A flaky release-critical test is a defect, not something to normalize with
  rerun-until-green. Retries stay disabled (`retries: 0`); failure artifacts
  (trace/video/screenshot under `test-results/` plus the HTML report) are
  retained on the failing run itself and uploaded by the `E2E` workflow.

## Commands

```bash
pnpm test:e2e
```

Before merging a substantial change also run:

```bash
docker compose run --rm web npm run lint
docker compose run --rm web npm run build
```

In CI the `Verify` build step also scans the browser bundle (`.next/static`)
for its placeholder server secrets and fails on any match; see
`docs/SECURITY.md`.

## UAT pilot data pack (Plan 11)

Manual UAT runs against repeatable seed data, never production personal data.
The pack is seeded by `scripts/uat/seed.mjs` (refuses non-local hosts; lives
alongside the E2E fixture contract):

```bash
node scripts/uat/seed.mjs                                                # seed
node scripts/uat/seed.mjs --cleanup scripts/uat/outputs/<manifest>.json  # one run
pnpm db:reset                                                       # hard reset
```

Cleanup uses only the user and Provider identities in the generated manifest. Old manifests without identities are refused; reset the disposable stack instead. The database suite runs a two-pack seed and cleanup isolation check (`tests/integration/uat.db.test.ts`); it requires the local Supabase JWT secret as well as the standard test credentials.

It prints a credential manifest for the four personas (one-person Shop,
multi-Staff Shop, Independent Provider, closed-intake Shop). The pilot record
lives in `docs/release/v0.1.0-hardening/evidence/11-UAT-PILOT.md`.

## Real PostgreSQL / RLS integration tests

Run `supabase db reset` before `pnpm test:db` when working against a local
Supabase stack. `pnpm test:db` runs `vitest run tests/integration`, executing
all `*.db.test.ts` files:

```text
tests/integration/
  auth.db.test.ts              — Auth & public-operation RPC permissions
  providers.db.test.ts         — Provider isolation, onboarding, settings
  service-modes.db.test.ts     — Service Mode CRUD & Provider isolation
  invitations.db.test.ts       — Invitation lifecycle & staff offboarding
  repair-requests.db.test.ts   — RepairRequest lifecycle & Provider isolation
  repairs.db.test.ts           — Repair lifecycle & Provider isolation
  tracking.db.test.ts          — Public tracking & observation
  internal-operations.db.test.ts — Internal operator grants, audit, denials
  internal-operations-overlap.db.test.ts — Overlapping audit/revoke and grant sessions
  internal-metrics.db.test.ts  — Aggregate grants, fixed past-window snapshot/deltas, nonempty baselines, database as_of, future bounds and representative EXPLAIN timing
  feedback.db.test.ts          — Private Feedback grants, constraints, nonce retry, reviews, feedback budget, old-state upgrade check, count-summary grants, denials, windows, and exact counts
  feedback-projection.db.test.ts — Feedback persistence through PostgREST: keyset paging, detail/history bounds, null clearing
  feedback-summary-manila.db.test.ts — Manila-aligned summary bounds and day buckets, one REPEATABLE READ snapshot, rolled back
  feedback-review-flow.db.test.ts — Feedback review keeps stored notes and link; explicit null clears
  load-stress.db.test.ts       — Burst invariants (Plan 10)
  helpers/
    supabase-test-context.ts   — client setup, user/fixture lifecycle
    shared-test-utils.ts       — reusable DB fixture helpers
tests/helpers/
  local-postgres.ts            — loopback-guarded local psql via Docker (test-only)
```

Any shared fixture logic lives in `tests/integration/helpers/` as a small test-only
seam, not a generic testing framework.

In CI, the database job pins the Supabase CLI, overrides only the generated
database port to `55432` to avoid runner collisions, retries startup once after
cleaning stale local Supabase state, and always stops the stack. This does not
change the normal local Supabase ports.

Feature 06 database coverage verifies `tracking_events` direct-access denial,
including over-128-byte neutral observation input, exact stored column shape,
repeated raw views versus distinct-Repair adoption, and both Repair origins. Apply
`20260825010000_add_tracking_analytics.sql` through a fresh reset before running
that coverage.

Plan 02 database coverage also verifies the durable public-operation limiter's
exact concurrent threshold, shared state across separate service clients,
operation isolation, expiry reset, bounded cleanup, opaque stored actor keys,
and denial of limiter/public-operation RPC execution to both `anon` and
authenticated roles.

Issue #88 database coverage verifies that `anon`, authenticated, and
`service_role` clients cannot directly insert/update/delete the private internal
tables (service_role reads only), that the admin and audit functions are not
executable by ordinary clients, that grant/revoke is atomic and idempotent,
that an invalid actor rolls back the mapping plus required audit, that the audit
RPC rechecks the enabled mapping so revocation wins over a delayed append, and
that Auth deletion removes the mapping while nulling the direct user references
on retained audit rows (not full anonymization).

`src/features/feedback/feedback.test.ts` mocks the real auth, limiter, Supabase, and
audit seams to prove limiter-first ordering, forged-field rejection, Provider class
derivation, no-query denials, audit-failure withholding, review preconditions, and
schema bounds. It needs no database.

`tests/integration/feedback.db.test.ts` uses the same live psql sessions for
same-nonce submissions and same-version reviews, the review/revocation overlap,
and a rolled-back history-trigger fault. The fault exists only inside an open
transaction and is removed by its `ROLLBACK`.

`tests/integration/internal-operations-overlap.db.test.ts` uses live psql
sessions through the running local Supabase database container (matched by the
host port bound to the API container, after loopback and local Docker endpoint
checks). It holds an audit append open while a
revoke waits on the observed `pg_blocking_pids` state, and it overlaps two
first grants for one operator. Both assert one consistent outcome. Sessions
carry lock, statement, and idle-transaction timeouts and close in `finally`.

`tests/e2e/internal-operations.spec.ts` covers anonymous return-to-login,
successful auth-only operator login to `/internal`, non-indexable rendering, a
real `/internal` visit that persists a new `INTERNAL_ACCESS_VIEW` event, a
temporary actor-scoped audit failure that shows only the unavailable state and
persists no view event (the fault is dropped in `finally`), immediate denial
after revocation, and 404 for Provider OWNER/STAFF/INDEPENDENT accounts that
have no internal mapping. The E2E fixture reaches the local database through
`tests/helpers/local-postgres.ts`, which refuses non-loopback Supabase URLs and
non-local Docker endpoints before any SQL runs.

## Load & resilience harness

Plan 10 adds a zero-dependency load harness under `scripts/load/` that runs
against a real stack outside Vitest/CI. Runner CLI contract tests exercise
selection, local page preconditions, and failure/denial exit status in CI. The
live load runs are separate from the automated suite; the burst _invariants_ it would validate are asserted in CI by
`tests/integration/load-stress.db.test.ts` (same-Repair and same-Request races
serialize to one durable outcome; public-operation abuse bursts are denied
above the durable budget).

Prerequisites and usage live in `docs/DEVELOPMENT.md`. Corrected baselines and
public-action measurements are still pending; see
`docs/release/v0.1.0-hardening/evidence/10-LOAD-RESILIENCE-BASELINES.md`.
