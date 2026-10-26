# Evidence — Release Readiness Go/No-Go (Plan 14)

**Requirement:** a final Lead go/no-go gate where every checklist item carries
evidence at the decision moment.
**Repository docs:** [Plan 14](plans/14_RELEASE_READINESS_GO_NO_GO_PLAN.md),
authoritative source
[`handoff/09_RELEASE_READINESS_CHECKLIST.md`](handoff/09_RELEASE_READINESS_CHECKLIST.md).
**Related:** [RELEASE_NOTES.md](../RELEASE_NOTES.md) (PR #99),
[evidence/12-RC-DEPLOYMENT-REHEARSAL.md](12-RC-DEPLOYMENT-REHEARSAL.md),
[docs/OPERATIONS.md](../../../OPERATIONS.md).

**Recording environment for the runs below:** branch
`chore/51-release-readiness-evidence` @ `f8641d8` (= `staging` head at that
time), 2026-10-26, Node 24, local Supabase stack, real PostgreSQL integration
suite and full Playwright suite executed locally. Runtime/owner-only gates stay
explicitly TBD — they are checked only during the actual ceremony.

## Automated verification — recorded runs

| Command (in CI order)           | Local result @ `f8641d8`, 2026-10-26 | Notes                                                                                                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`             | PASS (repo files)                    | The only flagged paths are untracked local tooling dirs and `scripts/uat/outputs/*.json` manifests; ignore rules ride in PRs #84/#98                                                                                                                                             |
| `pnpm lint`                     | PASS                                 | 1 pre-existing plugin warning, no errors                                                                                                                                                                                                                                         |
| `pnpm typecheck`                | PASS                                 | `next typegen && tsc --noEmit`                                                                                                                                                                                                                                                   |
| `pnpm test:run`                 | 214/214 PASS                         | Unit + contract suites                                                                                                                                                                                                                                                           |
| `pnpm db:reset`                 | PASS                                 | Local stack reset before both DB and E2E runs                                                                                                                                                                                                                                    |
| `pnpm test:db`                  | 52/53 PASS                           | Single failure is the documented local-stack quirk (see below); the same suite is green in CI                                                                                                                                                                                    |
| `pnpm build`                    | PASS                                 |                                                                                                                                                                                                                                                                                  |
| Docker Build                    | PASS in CI                           | Required workflow green on `staging` @ `f8641d8` ([run](https://github.com/Jacinth091/Tracknologia/actions/runs/40322721478)) and @ `c33c7fd` ([run](https://github.com/Jacinth091/Tracknologia/actions/runs/40336824757)) — not re-pulled locally (base image download avoided) |
| Core Playwright release suite   | 6/6 PASS                             | Full `pnpm test:e2e` against the local stack; initial run failed only until the local dev env was applied — see local-run note below                                                                                                                                             |
| No release-critical flaky tests | PASS (observed)                      | Unit/contract suite re-run repeatedly across hardening branches without flake; flake re-check continues in CI                                                                                                                                                                    |

**Local `test:db` quirk (not a regression):** local Supabase CLI images
blanket-grant `anon` CRUD default privileges on `providers` from the local stack
itself (not from Tracknologia migrations), masking one RLS assertion in
`providers.db.test.ts`. The rehearsal script tolerates it locally via
`REHEARSAL_ALLOW_ANON_QUIRK=1`; upstream CI (Database Integration required) runs
the identical suite green on every promotion-capable branch.

**Local E2E note:** the two public (unauthenticated) flows require the local
dev runtime contract — `PUBLIC_ABUSE_SHARED_DEV_BUCKET=true` (no trusted proxy
in front, so the durable limiter uses the shared dev bucket) and
`NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION=false`. With those applied the full
suite passes 6/6; the same suite is required in CI
([E2E run green](https://github.com/Jacinth091/Tracknologia/actions/runs/40336824562)).

**CI on the exact branch base:** CI ✅
([run](https://github.com/Jacinth091/Tracknologia/actions/runs/40322721310)),
Docker ✅, E2E ✅ on `staging` @ `f8641d8`, plus all three green on current
`staging` head `c33c7fd` (2026-10-26).

## Gate mapping

### Scope and governance

| Gate                             | Status | Evidence                                                                                                                                     |
| -------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| MVP Modules implemented          | DONE   | Shipped requirements appear in this commit (repairs, repair-requests, providers, auth, tracking modules + tests)                             |
| Soft freeze completed            | TBD    | Plan 12 ceremony record ([evidence/12](12-RC-DEPLOYMENT-REHEARSAL.md))                                                                       |
| Hard freeze active               | TBD    | Same as above                                                                                                                                |
| Every open issue has P0/P1/P2/P3 | 16/17  | All open issues carry priority labels except umbrella #81 (v0.2.0) — fork identity lacks upstream label perms; owner adds `P3: Low Priority` |
| No unresolved P0                 | PASS   | No open P0/P1 defect reports; #51's `P0` label denotes the gate itself, not a defect                                                         |
| No unresolved P1                 | PASS   | Same as above (#49's `P1` denotes the RC step, not a defect)                                                                                 |
| Accepted P2 risks documented     | TBD    | Record at approval (form below)                                                                                                              |

### Architecture

| Gate                                                    | Status             | Evidence                                                                                                                |
| ------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `src/app` remains application/framework adaptation      | PASS per structure | Server actions/actions.ts delegate to feature Interfaces; routes own only transport concerns (see docs/ARCHITECTURE.md) |
| Business behavior remains in `src/features`             | PASS per structure | Same; lifecycle, invitations, abuse, tracking rules live in feature modules                                             |
| Module Interfaces remain caller/test seams              | PASS per structure | Feature `index.ts` barrel contracts; tested through them                                                                |
| No unjustified generic service/manager/repository stack | PASS               | No such layer exists in the repo                                                                                        |
| No new cross-Module dependency cycle                    | PASS               | Dependency direction app → features → persistence; lint + typecheck green                                               |

Lead re-confirmation of the structure rows happens at the gate using this
commit; the rows are recorded here only as evidence pointers.

### Auth / Provider access

| Gate                                          | Status | Evidence                                                                                                                |
| --------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| Unauthenticated access denied                 | PASS   | `tests/contracts/` + E2E (protected routes redirect)                                                                    |
| Missing membership fails closed               | PASS   | `requireProviderContext()` fail-closed path (unit + integration covered)                                                |
| OWNER works                                   | PASS   | `auth.db.test.ts`, `repairs.db.test.ts` POSITIVE cases                                                                  |
| STAFF works                                   | PASS   | Same suites, STAFF membership cases                                                                                     |
| Cross-Provider access denied                  | PASS   | `providers.db.test.ts`, `repairs.db.test.ts` isolation cases (green in CI; locally masked only by the documented quirk) |
| Staff offboarding works                       | PASS   | Invitation offboarding cuts application auth + RLS (invitations suite; hardening PR)                                    |
| Removed Staff denied by app + RLS             | PASS   | Same evidence as above                                                                                                  |
| Auth infrastructure errors handled distinctly | PASS   | Error taxonomy in feature modules; unit covered                                                                         |

### Provider onboarding / Staff

| Gate                                   | Status | Evidence                                                                                 |
| -------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| Independent onboarding works           | PASS   | E2E + integration                                                                        |
| Shop Owner onboarding works            | PASS   | E2E + integration                                                                        |
| Staff joins by secure invitation only  | PASS   | `invitations.db.test.ts`                                                                 |
| Invitation single-use                  | PASS   | Same suite                                                                               |
| Invitation expires                     | PASS   | Same suite                                                                               |
| Invitation revocable                   | PASS   | Same suite                                                                               |
| Email binding works                    | PASS   | Same suite (invited-email binding + mismatch error detail)                               |
| Duplicate-active-invite policy defined | PASS   | Unique active-invitation constraint + tested refusal                                     |
| Production email delivery works        | TBD    | Resend production configuration at deploy ([evidence/12](12-RC-DEPLOYMENT-REHEARSAL.md)) |

### Repair Requests

| Gate                               | Status | Evidence                                                                                       |
| ---------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| Public submission works            | PASS   | E2E-02 + `repair-requests.db.test.ts`                                                          |
| Closed Provider rejects submission | PASS   | Same suite                                                                                     |
| Unsupported Service Mode rejected  | PASS   | Same suite + service-modes suite                                                               |
| Provider isolation holds           | PASS   | Same suite                                                                                     |
| Accept creates exactly one Repair  | PASS   | Accept tests + serialization constraint                                                        |
| Decline creates none               | PASS   | Same suite                                                                                     |
| Accept/decline races safe          | PASS   | Race tests green (race-same-request corrected and locked by PR #84)                            |
| Durable abuse protection active    | PASS   | Limiter unit tests + RPC contract (`check_public_operation_rate_limit`) + E2E ingress behavior |

### Repairs

| Gate                           | Status | Evidence                                    |
| ------------------------------ | ------ | ------------------------------------------- |
| Direct creation works          | PASS   | E2E-01 + `repairs.db.test.ts`               |
| Request-origin creation works  | PASS   | E2E-02 + `repair-requests.db.test.ts`       |
| IN_PROGRESS initial status     | PASS   | Lifecycle tests                             |
| Transitions valid              | PASS   | Lifecycle transition matrix tests           |
| Status Events consistent       | PASS   | `repair_status_events` append-only coverage |
| Customer Updates safe          | PASS   | Customer-update validation tests            |
| Completion terminal            | PASS   | Lifecycle terminal-state tests              |
| Cross-Provider mutation denied | PASS   | Integration isolation cases                 |
| Concurrency regression green   | PASS   | Race/concurrency tests re-run green today   |

### Tracking / Analytics

| Gate                                            | Status | Evidence                                                               |
| ----------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| Malformed/unknown codes neutral                 | PASS   | `tracking.db.test.ts` + contract tests                                 |
| Safe allow-listed public projection             | PASS   | Same suite (customer-safe projection; no private fields)               |
| No private leakage                              | PASS   | Same suite + E2E-01/02 tracking assertions                             |
| Updates bounded                                 | PASS   | Update-count bounds in tests                                           |
| Durable public rate protection                  | PASS   | Limiter unit tests + integration                                       |
| Analytics failure does not fail Tracking        | PASS   | Degradation tests (tracking succeeds with analytics down)              |
| No raw Tracking credential stored               | PASS   | Tracking code stored hashed/at-rest transformed (per test + migration) |
| Telemetry retention/growth policy defined       | PASS   | `tracking_events` retention caps from #47 work (PR #84; see            |
| [evidence/10](10-LOAD-RESILIENCE-BASELINES.md)) |

### Load / resilience

All pilot targets achieved and recorded:
[evidence/10-LOAD-RESILIENCE-BASELINES.md](10-LOAD-RESILIENCE-BASELINES.md)
(PR #84). Dashboard, Tracking and Request-submission load tested; concurrency
races repeated; no pool exhaustion or sustained lock backlog at intended pilot
load; p95/error rate within targets; dependency-failure behavior recorded.

### CI / governance

| Gate                                             | Status | Evidence                                                                                                     |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------ |
| Branch Policy required                           | PASS   | `.github/workflows/branch-policy.yml` enforces promotion chain                                               |
| Verify required                                  | PASS   | `ci.yml` required checks                                                                                     |
| Database Integration required for staging/master | PASS   | `ci.yml` (observed required on PRs; green)                                                                   |
| Docker Build required for release promotion      | PASS   | `docker.yml` green on `staging` ([run](https://github.com/Jacinth091/Tracknologia/actions/runs/40322721478)) |
| Playwright required once proven reliable         | PASS   | `e2e.yml` green ([run](https://github.com/Jacinth091/Tracknologia/actions/runs/40336824562))                 |
| Master promotion remains staging-only            | PASS   | Branch policy workflow                                                                                       |

### UAT

Personas remain human-executed. Delivery toolkit is ready:

- [evidence/11-UAT-PILOT.md](11-UAT-PILOT.md)
- `scripts/uat/seed.mjs` test data pack (4 personas, end-to-end validated,
  `--cleanup` verified) — PR #98

```text
[ ] Shop Owner flow accepted
[ ] Shop Staff flow accepted
[ ] Independent flow accepted
[ ] Customer Request accepted
[ ] Customer Tracking accepted
[ ] hostile/cross-tenant checks accepted
[ ] mobile core flows accepted
[ ] accessibility blockers resolved
```

### Configuration / migration / recovery

Owned by the deploy ceremony; record lives in
[evidence/12-RC-DEPLOYMENT-REHEARSAL.md](12-RC-DEPLOYMENT-REHEARSAL.md) and the
operational runbook ([docs/OPERATIONS.md](../../../OPERATIONS.md)):

```text
[ ] production Supabase configuration
[ ] explicit HTTPS app origin
[ ] production Resend configuration
[ ] no test-only toggles
[ ] fresh migration rehearsal
[ ] upgrade migration rehearsal (`pnpm rehearse:migrations`)
[ ] backup/snapshot available
[ ] restore/forward-fix process understood (runbook)
```

### Release Candidate

Owned by Plan 12 ([evidence/12](12-RC-DEPLOYMENT-REHEARSAL.md)):

```text
[ ] immutable v0.1.0-rc.N tag
[ ] two consecutive full green validation cycles
[ ] release notes ready            -> drafted: ../RELEASE_NOTES.md (PR #99)
[ ] known limitations recorded     -> drafted: same file
[ ] exact approved commit deployed
[ ] production smoke green
[ ] v0.1.0 tag identifies production commit
```

## Approval record (fill at the gate, owner/Lead)

```text
Release decision: __________________________
Approved by: ______________________________
Candidate commit: _________________________
RC tag: ___________________________________
Production release tag: ___________________

Accepted P2 risks:
1. ________________________________________
2. ________________________________________
3. ________________________________________
```

## Owner deliverables traced from this session (2026-10-26)

1. Add priority label to umbrella #81 (fork token lacks upstream label perms).
2. Run the Plan 12 ceremony at the chosen RC SHA; both rehearsal evidence and
   the two green cycles land in [evidence/12](12-RC-DEPLOYMENT-REHEARSAL.md).
3. Execute UAT personas using the pack in evidence/11 + PR #98.
4. Complete this file's approval block after the Go/No-Go meeting.
