# Evidence — Release Readiness Go/No-Go (Plan 14)

**Requirement:** a final Lead go/no-go gate where every checklist item carries
evidence at the decision moment.
**Repository docs:** [Plan 14](../plans/14_RELEASE_READINESS_GO_NO_GO_PLAN.md),
authoritative source
[handoff checklist](../handoff/09_RELEASE_READINESS_CHECKLIST.md).
**Dependencies:** [PR #84](https://github.com/Jacinth091/Tracknologia/pull/84) (partial load harness), [PR #98](https://github.com/Jacinth091/Tracknologia/pull/98) (UAT pack), and [PR #99](https://github.com/Jacinth091/Tracknologia/pull/99) (RC evidence and release notes) remain open. Their draft artifacts are not accepted release evidence. [Operations runbook](../../../OPERATIONS.md).

**Decision status: NOT VERIFIED / NO-GO pending evidence.** No immutable RC SHA
has been selected. All gate statuses below are TBD or BLOCKED until the Lead verifies
specific evidence against the same approved candidate SHA. Historical run
results and test references are leads for the review, not candidate passes.
Open P0/P1 findings and review blockers must be reconciled independently of
issue labels. The final decision, approvals and accepted risks remain unfilled.

**Historical baseline:** author-reported local runs on `staging` at `f8641d8`,
2026-10-26, Node 24 and a local Supabase stack. These results do not certify a
future candidate; retain exact run URLs as historical references only.

## Automated verification — recorded runs

| Command (in CI order)           | Local result @ `f8641d8`, 2026-10-26 | Notes                                                                                                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`             | PASS (repo files)                    | The only flagged paths are untracked local tooling dirs and `scripts/uat/outputs/*.json` manifests; ignore rules ride in PRs #84/#98                                                                                                                                             |
| `pnpm lint`                     | PASS                                 | 1 pre-existing plugin warning, no errors                                                                                                                                                                                                                                         |
| `pnpm typecheck`                | PASS                                 | `next typegen && tsc --noEmit`                                                                                                                                                                                                                                                   |
| `pnpm test:run`                 | 214/214 PASS                         | Unit + contract suites                                                                                                                                                                                                                                                           |
| `pnpm db:reset`                 | PASS                                 | Local stack reset before both DB and E2E runs                                                                                                                                                                                                                                    |
| `pnpm test:db`                  | FAIL (52/53)                         | One local failure; the reported cause requires independent verification (see below)                                                                                                                                                                                              |
| `pnpm build`                    | PASS                                 |                                                                                                                                                                                                                                                                                  |
| Docker Build                    | PASS in CI                           | Required workflow green on `staging` @ `f8641d8` ([run](https://github.com/Jacinth091/Tracknologia/actions/runs/40322721478)) and @ `c33c7fd` ([run](https://github.com/Jacinth091/Tracknologia/actions/runs/40336824757)) — not re-pulled locally (base image download avoided) |
| Core Playwright release suite   | 6/6 PASS                             | Full `pnpm test:e2e` against the local stack; initial run failed only until the local dev env was applied — see local-run note below                                                                                                                                             |
| No release-critical flaky tests | NOT VERIFIED                         | Unit/contract suite re-run repeatedly across hardening branches without flake; flake re-check continues in CI                                                                                                                                                                    |

**Historical local database failure:** One of 53 tests failed. The original
report attributed it to local Supabase default grants; that attribution and
any effect on the candidate must be independently verified. A green historical
CI run does not turn the failed local run into a pass.

**Local E2E note:** the two public (unauthenticated) flows require the local
dev runtime contract — `PUBLIC_ABUSE_SHARED_DEV_BUCKET=true` (no trusted proxy
in front, so the durable limiter uses the shared dev bucket) and
`NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION=false`. With those applied the full
suite passes 6/6; the same suite is required in CI
([E2E run green](https://github.com/Jacinth091/Tracknologia/actions/runs/40336824562)).

**Historical CI on the branch base (not candidate evidence):** CI ✅
([run](https://github.com/Jacinth091/Tracknologia/actions/runs/40322721310)),
Docker ✅, E2E ✅ on `staging` @ `f8641d8`, plus all three green on the then-current
`staging` head `c33c7fd` (2026-10-26).

## Candidate evidence and gate mapping

Candidate SHA / immutable RC tag: **TBD**. Two complete green cycles on that
unchanged SHA, their run links, environment and dates: **TBD**. Every gate in
this section remains **TBD or BLOCKED**, even where a historical test or source is named,
until candidate-specific evidence and the responsible review are recorded.

### Scope and governance

| Gate                             | Status | Evidence                                                                                                                                     |
| -------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| MVP Modules implemented          | TBD    | Shipped requirements appear in this commit (repairs, repair-requests, providers, auth, tracking modules + tests)                             |
| Soft freeze completed            | TBD    | Plan 12 ceremony; proposed record pending in PR #99                                                                                          |
| Hard freeze active               | TBD    | Same as above                                                                                                                                |
| Every open issue has P0/P1/P2/P3 | TBD    | All open issues carry priority labels except umbrella #81 (v0.2.0) — fork identity lacks upstream label perms; owner adds `P3: Low Priority` |
| No unresolved P0                 | TBD    | Reconcile issues and open review findings at the candidate gate, independent of labels                                                       |
| No unresolved P1                 | TBD    | Reconcile issues and open review findings at the candidate gate, independent of labels                                                       |
| Accepted P2 risks documented     | TBD    | Record at approval (form below)                                                                                                              |

### Architecture

| Gate                                                    | Status | Evidence                                                                                                                |
| ------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `src/app` remains application/framework adaptation      | TBD    | Server actions/actions.ts delegate to feature Interfaces; routes own only transport concerns (see docs/ARCHITECTURE.md) |
| Business behavior remains in `src/features`             | TBD    | Same; lifecycle, invitations, abuse, tracking rules live in feature modules                                             |
| Module Interfaces remain caller/test seams              | TBD    | Feature `index.ts` barrel contracts; tested through them                                                                |
| No unjustified generic service/manager/repository stack | TBD    | No such layer exists in the repo                                                                                        |
| No new cross-Module dependency cycle                    | TBD    | Dependency direction app → features → persistence; lint + typecheck green                                               |

Lead review of these evidence pointers must be performed on the selected candidate SHA.

### Auth / Provider access

| Gate                                          | Status | Evidence                                                                                                             |
| --------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| Unauthenticated access denied                 | TBD    | `tests/contracts/` + E2E (protected routes redirect)                                                                 |
| Missing membership fails closed               | TBD    | `requireProviderContext()` fail-closed path (unit + integration covered)                                             |
| OWNER works                                   | TBD    | `auth.db.test.ts`, `repairs.db.test.ts` POSITIVE cases                                                               |
| STAFF works                                   | TBD    | Same suites, STAFF membership cases                                                                                  |
| Cross-Provider access denied                  | TBD    | `providers.db.test.ts`, `repairs.db.test.ts` isolation cases; investigate the historical local failure independently |
| Staff offboarding works                       | TBD    | Invitation offboarding cuts application auth + RLS (invitations suite; hardening PR)                                 |
| Removed Staff denied by app + RLS             | TBD    | Same evidence as above                                                                                               |
| Auth infrastructure errors handled distinctly | TBD    | Error taxonomy in feature modules; unit covered                                                                      |

### Provider onboarding / Staff

| Gate                                   | Status | Evidence                                                                     |
| -------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| Independent onboarding works           | TBD    | E2E + integration                                                            |
| Shop Owner onboarding works            | TBD    | E2E + integration                                                            |
| Staff joins by secure invitation only  | TBD    | `invitations.db.test.ts`                                                     |
| Invitation single-use                  | TBD    | Same suite                                                                   |
| Invitation expires                     | TBD    | Same suite                                                                   |
| Invitation revocable                   | TBD    | Same suite                                                                   |
| Email binding works                    | TBD    | Same suite (invited-email binding + mismatch error detail)                   |
| Duplicate-active-invite policy defined | TBD    | Unique active-invitation constraint + tested refusal                         |
| Production email delivery works        | TBD    | Resend production configuration at deploy; proposed record pending in PR #99 |

### Repair Requests

| Gate                               | Status | Evidence                                                                                       |
| ---------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| Public submission works            | TBD    | E2E-02 + `repair-requests.db.test.ts`                                                          |
| Closed Provider rejects submission | TBD    | Same suite                                                                                     |
| Unsupported Service Mode rejected  | TBD    | Same suite + service-modes suite                                                               |
| Provider isolation holds           | TBD    | Same suite                                                                                     |
| Accept creates exactly one Repair  | TBD    | Accept tests + serialization constraint                                                        |
| Decline creates none               | TBD    | Same suite                                                                                     |
| Accept/decline races safe          | TBD    | Existing race tests are historical references; PR #84 remains unmerged and requires acceptance |
| Durable abuse protection active    | TBD    | Limiter unit tests + RPC contract (`check_public_operation_rate_limit`) + E2E ingress behavior |

### Repairs

| Gate                           | Status | Evidence                                                 |
| ------------------------------ | ------ | -------------------------------------------------------- |
| Direct creation works          | TBD    | E2E-01 + `repairs.db.test.ts`                            |
| Request-origin creation works  | TBD    | E2E-02 + `repair-requests.db.test.ts`                    |
| IN_PROGRESS initial status     | TBD    | Lifecycle tests                                          |
| Transitions valid              | TBD    | Lifecycle transition matrix tests                        |
| Status Events consistent       | TBD    | `repair_status_events` append-only coverage              |
| Customer Updates safe          | TBD    | Customer-update validation tests                         |
| Completion terminal            | TBD    | Lifecycle terminal-state tests                           |
| Cross-Provider mutation denied | TBD    | Integration isolation cases                              |
| Concurrency regression green   | TBD    | Run and record candidate-specific race/concurrency tests |

### Tracking / Analytics

| Gate                                                                                    | Status  | Evidence required                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neutral unknown codes, allow-listed projection, bounded updates, and no private leakage | TBD     | Candidate-specific Tracking and contract test results                                                                                                                                                       |
| Public rate protection and isolated analytics failure                                   | TBD     | Candidate-specific tests and real-ingress/dependency-failure evidence                                                                                                                                       |
| Tracking credential handling                                                            | TBD     | Verify the candidate against `docs/DATABASE.md` and `docs/SECURITY.md`: `repairs.tracking_code` stores the operational code under RLS; `tracking_events` does not store it. Verify log handling separately. |
| `No raw Tracking credential stored` checklist requirement                               | BLOCKED | The literal requirement conflicts with the current Repairs schema. Obtain an explicit Lead decision or separately approved implementation; do not mark it PASS by narrowing its meaning.                    |
| Telemetry retention/growth policy                                                       | TBD     | Record a specific Lead-approved retention or aggregation rule, storage-growth assumptions, and linked decision for the candidate. PR #84 does not establish one.                                            |

### Load / resilience

**NOT VERIFIED.** [PR #84](https://github.com/Jacinth091/Tracknologia/pull/84)
is a partial harness and remains unmerged. Its previous baselines were
withdrawn. Before the release gate, record corrected, sanitized and reproducible
candidate-specific dashboard and public Tracking/Request measurements,
concurrency and resource observations, p95/error results, and actual
Supabase, Resend and analytics dependency-failure drills. Link the artifacts
and candidate SHA; no pilot target or dependency drill is currently certified.

### Public abuse / ingress contract

**TBD:** record candidate-specific production configuration, trusted-ingress
header stripping and proxy proof, blocked direct upstream access, public
Tracking and Request behavior through ingress, budget denial, and direct RPC
permission checks. See Plan 14 and the Plan 12 rehearsal.

### CI / governance

| Gate                                             | Status | Evidence                                                                                                     |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------ |
| Branch Policy required                           | TBD    | `.github/workflows/branch-policy.yml` enforces promotion chain                                               |
| Verify required                                  | TBD    | `ci.yml` required checks                                                                                     |
| Database Integration required for staging/master | TBD    | `ci.yml` (observed required on PRs; green)                                                                   |
| Docker Build required for release promotion      | TBD    | `docker.yml` green on `staging` ([run](https://github.com/Jacinth091/Tracknologia/actions/runs/40322721478)) |
| Playwright required once proven reliable         | TBD    | `e2e.yml` green ([run](https://github.com/Jacinth091/Tracknologia/actions/runs/40336824562))                 |
| Master promotion remains staging-only            | TBD    | Branch policy workflow                                                                                       |

### UAT

**TBD:** human execution and acceptance are required. The proposed data pack and
pilot scaffold in [PR #98](https://github.com/Jacinth091/Tracknologia/pull/98)
remain unmerged; their CI checks do not constitute human UAT.

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

Owned by the deploy ceremony. The proposed rehearsal record is in
[PR #99](https://github.com/Jacinth091/Tracknologia/pull/99), which is still
unmerged. The [operations runbook](../../../OPERATIONS.md) is available:

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

Owned by Plan 12; the proposed evidence record is pending in [PR #99](https://github.com/Jacinth091/Tracknologia/pull/99):

```text
[ ] immutable v0.1.0-rc.N tag
[ ] two consecutive full green validation cycles
[ ] release notes ready            -> draft pending acceptance in PR #99
[ ] known limitations recorded     -> draft pending acceptance in PR #99
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
   the two green cycles must be recorded against that exact SHA.
3. After PR #98 is accepted, execute and record human UAT personas.
4. Complete this file's approval block after the Go/No-Go meeting.
