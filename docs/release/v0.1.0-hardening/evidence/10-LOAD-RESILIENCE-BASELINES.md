# Evidence — Load-Resilience Baselines (Plan 10)

**PR:** `chore/load-test-harness`
**Requirement:** repeatable load harness committed/documented; baseline metrics recorded; source load profiles executed.
**Repository doc:** [Plan 10](plans/10_LOAD_RESILIENCE_PERFORMANCE_AND_ANALYTICS_RETENTION_PLAN.md), authoritative source `handoff/05_LOAD_RESILIENCE_AND_PERFORMANCE.md`.

## Harness

Located at `scripts/load/`. Zero new runtime dependencies; runs on Node `>=24` (repo minimum) and drives the same persistence seams the application uses:

- Public operations (`tracking-lookup`, `request-submit`, `analytics-observation`, `abuse-burst`) run through a service-role Supabase client, matching `src/lib/supabase/service.ts`.
- Provider operations (`status-change`, race bursts) run through a minted-JWT client so `SECURITY DEFINER` RPCs resolve `auth.uid()` + membership.
- Page-read scenarios (`dashboard-read`, `repair-list-search`) perform real SSR HTTP GETs with a session cookie built exactly as `@supabase/ssr` round-trips it (`base64-<base64url>(JSON session)` under `sb-<host>-auth-token`).

## Method

- Seed once: `node scripts/load/seed.mjs` (creates a Provider, owner User, Repairs, and Repair Requests; writes `scripts/load/outputs/fixtures.json`).
- Run: `node scripts/load/harness.mjs` (executes all `profiles.json` stages; writes per-profile JSON captures under `scripts/load/outputs/`).
- Every profile is exercised at the plan's Start and Increase concurrency steps with a short ramp.
- Machine-readable per-stage captures: count, p50/p95/p99, error counts, denial counts, and error kinds.
- Burst invariants (same-Repair, same-Request, abuse denial) are also asserted in CI by `tests/integration/load-stress.db.test.ts`.

## Environment (baseline run)

_Filled in on the first recorded run._

| Env             | Value                                 |
| --------------- | ------------------------------------- |
| App runtime     | `next start` (build: `pnpm build`)    |
| Next.js version | 16.3.1                                |
| Node            | `>=24`                                |
| Supabase        | local Docker stack (`supabase start`) |
| PostgREST       | bundled by Supabase stack             |
| Harness node    | `~/.local/node24/bin/node`            |
| Date / git SHA  | TBD                                   |

## Pilot Targets vs Baselines

```text
Provider-page p95 < 1.5 s      → TBD
Tracking p95 < 2 s             → TBD
mutation p95 < 2 s             → TBD
system error rate < 1%         → TBD
no tenant leakage              → covered by tests/integration/load-stress + RLS suite
no data corruption             → covered by tests/integration/load-stress
no sustained lock backlog      → TBD (observe Supabase logs during run)
no connection-pool exhaustion  → TBD (observe Supabase logs during run)
```

## Recorded Baselines

Each profile block lists every stage (concurrency, duration, ramp), its sample count, and `p50/p95/p99` ms plus error/denial counts from `scripts/load/outputs/<profile>-<timestamp>.json`.

### dashboard-read

_stages recorded after first run._

### repair-list-search

_stages recorded after first run._

### tracking-lookup

_stages recorded after first run._

### request-submit

_stages recorded after first run._

### status-change

_stages recorded after first run._

### analytics-observation

_stages recorded after first run._

### abuse-burst

_stages recorded after first run._

### race-same-repair

_stages recorded after first run._

### race-same-request

_stages recorded after first run._

## Verdict

```text
Provider-page p95 < 1.5 s  : TBD (achieved / missed)
Tracking p95 < 2 s         : TBD (achieved / missed)
mutation p95 < 2 s         : TBD (achieved / missed)
error rate < 1%            : TBD
public rate controls held  : covered by abuse-burst + load-stress.db.test.ts
races preserved invariants : covered by race bursts + load-stress.db.test.ts
no P0/P1 under pilot load  : TBD
```

Optimization is gated: no change ships without before/after metrics against these baselines (see Plan 10, "Optimization PR Rule").
