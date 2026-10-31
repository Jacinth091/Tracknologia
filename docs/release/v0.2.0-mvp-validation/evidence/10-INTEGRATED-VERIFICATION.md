# Issue #96 — Integrated verification matrix (v0.2.0)

**Record type:** release evidence matrix for the #96 integrated verification gate (Gates 4 and 5).

- **Status:** VERIFIED AT CANDIDATE (CI rows); owner-run items open.
- **Candidate:** `release/0.2.0` @ `29838f8ece32b34ec44f5cd337ea0f3a85da7277` (merge of PR #117, 2026-10-31).
- **Previous-release baseline:** `origin/staging` @ `420ed1a`, an ancestor of `release/0.2.0`.
- **Upgrade proof:** the CI push run on the candidate. Its rehearsal used `REHEARSAL_BASE_REF=staging` (`ci.yml`: `${{ github.base_ref || 'staging' }}`), so it rehearsed the pending-only upgrade from the previous release.
- **Context only:** the push run on `16d45e5` rehearsed successfully (run 40995856787). An earlier green run does not certify a later commit.

## Pending migrations since `staging` (8)

The candidate upgrade applied these eight migrations on top of the previous release:

1. `20261029090000_add_internal_operator_access`
2. `20261030090000_create_feedback_submissions`
3. `20261030090100_enable_feedback_public_abuse_limit`
4. `20261030090200_add_feedback_review_transaction`
5. `20261031000000_add_feedback_count_summary`
6. `20261031010000_add_feedback_privacy_audit`
7. `20261101000000_add_internal_validation_metrics`
8. `20261102000000_add_feedback_privacy_review_mark`

## Candidate CI runs

| Job | Result | Run |
| --- | --- | --- |
| Verify | pass | https://github.com/Jacinth091/Tracknologia/actions/runs/41157840245/job/124408486610 |
| Database integration | pass | https://github.com/Jacinth091/Tracknologia/actions/runs/41157840245/job/124408486419 |
| Playwright E2E | pass: 17 passed, 1 worker, retries 0 | https://github.com/Jacinth091/Tracknologia/actions/runs/41157840249/job/124408486354 |
| Docker Build | pass | https://github.com/Jacinth091/Tracknologia/actions/runs/41157840263 |
| Branch Policy | pass on PR #117's merged head `f904663`; runs on pull requests only, so no run exists at the candidate | https://github.com/Jacinth091/Tracknologia/actions/runs/41157145865 |

## Gate 4 — security and privacy

| #96 row | Proof at the candidate | Result @ candidate |
| --- | --- | --- |
| Actor matrix: public, Provider, internal entries, actions, RPCs | `internal-operations.spec` (enabled vs revoked operator, Provider denial, `/internal/activity` actor matrix, anonymous `/api/health` contract), `internal-feedback-inbox.spec` (Provider 404 and forged operator RPC), `feedback.spec` (OWNER, STAFF, INDEPENDENT, anon), `cross-tenant.spec`, `auth.db`, `internal-operations*.db` | pass: [E2E](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840249/job/124408486354); [Database integration](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840245/job/124408486419) |
| Provider A/B isolation, Tracking projection, Request accept/decline replay, status rules, tokens | `cross-tenant.spec`, `customer-request.spec` (replay), `repair-requests.db`, `repairs.db`, `tracking.db`, `invitations.db` | pass: [E2E](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840249/job/124408486354); [Database integration](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840245/job/124408486419) |
| No raw feedback or records in aggregates, traffic, logs, exports; PII canaries | E2E canary case `internal-operations.spec` ("the activity page renders no customer or feedback canary"), which checks customer name, phone, internal notes, reported problem, feedback title and feedback message on `/internal/activity`, and confirms the feedback message on the authorized `/internal/feedback/<id>` page. Also `feedback-privacy.db`, `feedback-projection.db`, `metrics.test` and `feedback.test` log canaries. Exports: none exist yet (moved to #116), so INAPPLICABLE | pass: [E2E](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840249/job/124408486354); [Database integration](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840245/job/124408486419); [Verify](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840245/job/124408486610) |
| Forged roles, providerId, stale sessions, forged ingress fail closed; no secrets logged | `rate-limit.test` (trusted-proxy and Vercel mode, forged headers), `public-actions.production-ingress.test`, `provider-security.contract`, `auth-proxy.contract`, `server.test` (secret-free errors) | pass: [Verify](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840245/job/124408486610) |
| RLS, grants, RPC EXECUTE, SECURITY DEFINER search_path, FKs, uniqueness, nonce and review transactions, migration replay | DB suites' grant and denial cases, the upgrade rehearsal, and the restore drill (RLS, anon and authenticated denials, RPC EXECUTE snapshot, migration history) | pass: [Database integration](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840245/job/124408486419) |
| Privacy notice, internal access, raw feedback handling, retention and erasure documented | Approved notice in the form (#91); `docs/SECURITY.md`; `docs/OPERATIONS.md` (redaction and purge, 90-day review, #112). #87 decisions: [comment 6512862795](https://github.com/Jacinth091/Tracknologia/issues/87#issuecomment-6512862795) and the backup decision [comment 6537380262](https://github.com/Jacinth091/Tracknologia/issues/87#issuecomment-6537380262) | documented |

## Gate 5 — build, test, upgrade, recovery

| #96 row | Proof at the candidate | Result @ candidate |
| --- | --- | --- |
| format → lint → typecheck → test:run → build (with LF note) | CI **Verify** (Linux runner, LF checkout), including the browser-bundle secret scan (#107, which closes the #90 carry-over) | pass: [Verify](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840245/job/124408486610) |
| `db:reset` + `test:db` | CI **Database integration** (every `tests/integration/*.db.test.ts` file) | pass: [Database integration](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840245/job/124408486419) |
| Pending-only upgrade + fresh install | Rehearsal against `origin/staging` @ `420ed1a` (v0.1.0). Shared migrations unchanged (forward-only verified). Applied only the 8 pending migrations; post-upgrade history equals base + pending. DB suite against the upgraded lab: `feedback cases: 45 passed, 0 failed, 1 skipped`; `upgrade cases: 2 passed (old-state fixture verified)`; `suite result: PASS`. The skipped case is the redaction-backfill upgrade case (#112), which runs only when the base already has the feedback tables. It passed on #112's own PR run. Fresh DB suite in the same job | pass: [Database integration](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840245/job/124408486419) |
| All release E2E without retries, plus the new journeys | CI **E2E**: `Running 17 tests using 1 worker`, `17 passed (2.3m)`, retries 0 | pass: [E2E](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840249/job/124408486354) |
| Backup and recovery in non-production, and rollback vs forward fix | CI restore drill (`scripts/drill-backup-restore.sh`, `pnpm drill:backup-restore`) in the Database integration job: 14 checks ok (Provider, OWNER membership, accepted Request, Repair READY and linked, 2 status events, Feedback REVIEWING version 2, review event, operator mapping, RLS, anon denied on `feedback_submissions` and `repairs`, authenticated denied on `feedback_submissions`, RPC EXECUTE unchanged, migration history). Summary: `migration rows: 26 recorded == 26 files`; `rls: 10 of 10 … enabled`; `grants: anon denied on feedback and repairs; RPC EXECUTE unchanged`; `suite result: PASS`. Owner backup decision: [comment 6537380262](https://github.com/Jacinth091/Tracknologia/issues/87#issuecomment-6537380262). The free plan has no hosted backups; RPO is the time since the last dump. Policy: forward fix, because migrations are forward-only. Hosted restore is owner-run (see below) | pass: [Database integration](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840245/job/124408486419) |
| Docker, branch policy, CI green at the exact SHA | CI **Docker** at the candidate. **Branch Policy** runs on pull requests only | pass: [Docker](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840263); Branch Policy pass on PR #117 head `f904663` ([run](https://github.com/Jacinth091/Tracknologia/actions/runs/41157145865)) |
| Failure drills | Verify and Database integration existing tests: `readiness.db` unreachable-URL case and `/api/health` 503 (#113), `access.test`, `auth.test`, `auth-proxy.contract`, `feedback.test`, `form.test`, `rate-limit.test`, `load-stress.db`. Monitoring sink and observer samples: INAPPLICABLE (moved to #115) | pass: [Verify](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840245/job/124408486610); [Database integration](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840245/job/124408486419) |

## Carry-overs

| Item | Status |
| --- | --- |
| #90: bundle scan for server secrets | pass: implemented in CI Verify (#107): [Verify](https://github.com/Jacinth091/Tracknologia/actions/runs/41157840245/job/124408486610) |
| #93: EXPLAIN at the pilot load | BLOCKED: the pilot volume isn't set in #87. Cite the existing 400-repair guardrail (`internal-metrics.db`). |
| #109: live Vercel production check | OWNER-RUN at the production pre-launch step. |
| Monitoring-sink and observer drills | INAPPLICABLE for v0.2.0. Not built; moved to #115. |
| Exports | INAPPLICABLE for v0.2.0. No export path exists; moved to #116. |

## Not covered by CI

These items are not proven by the candidate run. They stay open until the owner or the release process completes them:

- Hosted restore into a real Supabase project, and the first real dump before launch (owner, per the #87 backup decision).
- #109 production pre-launch check on Vercel (ingress, `PUBLIC_ABUSE_CLIENT_IP_SOURCE=vercel`).
- UptimeRobot on the deployed `/api/health` (#97 GO requirement).
- EXPLAIN at pilot load (#93 carry-over, BLOCKED on pilot volume).
- Zero-day baseline record from `/internal/activity` at launch (#97, amended 2026-10-31).
- #97 go/no-go itself.
