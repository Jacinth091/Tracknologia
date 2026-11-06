# Issue #87 — Scope, source inventory and privacy evidence

**Record type:** evidence and decision record for Gate 0, O0 and F0.

- **Status:** EVIDENCE ONLY — not an approval. No #87 checklist item is closed by this record. Issue #87 remains **OPEN** and v0.2.0 is **NOT RELEASE-READY**.
- **Prepared:** 2026-10-28; revision 5 (PR-prep repair candidate).
- **Author:** governed documentation Worker T01-A1 in the approved isolated source copy, prepared for Lead review. Revision 2 had the Prettier formatting failure; revision 3 passed all five independent verification checks, including Prettier. Candidate-specific verification results belong to the associated PR/run report.
- **Run:** 20261028-issue87-validation-readiness.
- **Governing sources:** [Issue #81](https://github.com/Jacinth091/Tracknologia/issues/81), [Issue #87](https://github.com/Jacinth091/Tracknologia/issues/87), and the committed repository documents linked in this record.
- **Companion proposal:** [02-DECISION-PROPOSAL.md](02-DECISION-PROPOSAL.md) — PROPOSED choices only, owner approval pending.

## 1. Purpose, scope and non-claims

This record inventories what is actually known about the release, its data sources, the Feedback contract and the open privacy decisions, so #88–#95 can cite one place instead of guessing.

It deliberately does **not**:

- approve a host, URL, pilot date, retention period, privacy notice or release scope;
- claim that a local configuration value, example value or plan statement is deployed behavior;
- mark a GitHub checklist box or close #87;
- implement Feedback, Operations monitoring, schema, copy or any later issue;
- record secret values, raw logs, participant data or production readings.

Reading rules used below:

- **Fixed point** means the inspected commit, not the deployed revision.
- **Local** means supported by the copied repository content.
- **Example/default** means a documentation or sample value, not deployed configuration.
- **PENDING** means an owner decision that has not been given. An unanswered question is never treated as approval.
- **UNKNOWN / UNAVAILABLE** means the reading has no real source. It is never rendered as zero, healthy or green.

## 2. Provenance and fixed points

This Worker inspected a temporary scratch copy. Any temporary worker input path (such as `_context/**`) is not a durable repository path; the durable authorities are the linked GitHub issues and repository documents.

| Item                     | Observation                                                                                                                                                                                | Status and limit                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Inspected copy           | Run-owned scratch copy of `480ffc57c85d59840b7a85de4b13de9948085d45` under the run workspaces directory; no Git repository inside.                                                         | Fixed point only; not a deployment or CI result.                                                                  |
| Destination baseline     | `480ffc57c85d59840b7a85de4b13de9948085d45` (detached HEAD recorded by the Lead).                                                                                                           | Not edited by this Worker.                                                                                        |
| Remote `staging`         | `d03628845639a488aaa9010e927bcc21b0792bd8`, observed through GitHub on 2026-10-28 and re-observed for this PR-prep revision.                                                               | Dated snapshot; recheck before relying on it.                                                                     |
| Code equivalence         | The Lead's 2026-10-28 inspection compared local and remote `staging` blob hashes for 180 tracked files.                                                                                    | Documentation baselines may differ; not a deploy claim.                                                           |
| GitHub deployment check  | GitHub deployments API returned no records on 2026-10-28; the GitHub Pages endpoint returned 404.                                                                                          | Neither observation proves that no application is deployed elsewhere. Host, URL and live revision remain UNKNOWN. |
| PR #78 prerequisite      | Brand UI merged at `b947a82099aaf1cb6afddc6cb850a2e83c048469` (issue #87 "Already done").                                                                                                  | Completed prerequisite; not v0.2.0 feature completion.                                                            |
| Release vehicle          | New release **v0.2.0**, not a v0.1.0 amendment (owner decision, 2026-10-23).                                                                                                               | Completed prerequisite.                                                                                           |
| GitHub state             | #81 and #87 open; #87 snapshot updated 2026-10-26T12:51:56Z; 15 decision boxes unchecked.                                                                                                  | Issue status is a dated snapshot; no GitHub write was made.                                                       |
| Source snapshots         | Temporary Worker inputs copied from [issue #81](https://github.com/Jacinth091/Tracknologia/issues/81) and [issue #87](https://github.com/Jacinth091/Tracknologia/issues/87) on 2026-10-28. | Sanitized issue text; the temporary files are not repository paths and attachments were not re-fetched.           |
| Source examples          | Temporary read-only excerpts of repository source/config files, staged with a SHA-256 manifest for this Worker.                                                                            | Not durable paths and not the full application tree; durable claims cite the repository documents in this record. |
| Migration list           | 18 committed migration filenames under `supabase/migrations/`.                                                                                                                             | Filenames only; remote applied state is UNKNOWN.                                                                  |
| Human decisions received | Host/URL, pilot date and retention/privacy policy answered **"undecided"** during setup.                                                                                                   | Recorded as PENDING. GO approved the run and isolation, not these policy choices.                                 |

**Dated Lead fact (2026-10-28):** PR integration is a detached checkout of `staging` at `d03628845639a488aaa9010e927bcc21b0792bd8`. That checkout and the inspected `480ffc57c85d59840b7a85de4b13de9948085d45` tree share the complete tracked tree `0053c1c7546f55e388fbe520fa6d3e3f5a5091ff`. This establishes tree identity only; neither fact establishes the deployed revision.

## 3. Status vocabulary

| Status                | Meaning                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| VERIFIED (local)      | Supported by inspected repository content or a sanitized source example.                                  |
| VERIFIED (snapshot)   | Supported by a dated GitHub issue/commit observation; recheck before use.                                 |
| CONTRACT (issue #81)  | Written in the umbrella issue as the implementation contract; not a substitute for owner policy approval. |
| PROPOSED              | A safe direction justified by evidence; requires approval before it becomes policy.                       |
| PARTIAL               | Some sub-items are supported; the row as a whole does not close.                                          |
| PENDING               | A required decision has not been given.                                                                   |
| UNKNOWN / UNAVAILABLE | No real source exists yet; never rendered as healthy or zero.                                             |
| NOT IMPLEMENTED       | The capability does not exist at the fixed point.                                                         |

## 4. Issue #87 checklist crosswalk

Every checklist item from the #87 body is listed once. "Evidence" cites this repository, not memory.

### Already-supported prerequisites

| #   | Item                                    | Status              | Evidence                                                              | Limit                                                 |
| --- | --------------------------------------- | ------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| A1  | PR #78 brand UI merged into `staging`   | VERIFIED (snapshot) | Merge commit `b947a82`; issue #87 "Already done"; issue #81 baseline. | Recheck current `staging` head before implementation. |
| A2  | Release vehicle is a new v0.2.0 release | VERIFIED (snapshot) | Owner decision recorded 2026-10-23 in issue #87.                      | Decision only; does not approve scope or date.        |

### Release scope

| #   | Item                                                  | Status  | Evidence / current state                                                                                                                     | Required proof (owner)                                                            |
| --- | ----------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| R1  | Confirm the target pilot start date                   | PENDING | Human answered "undecided". November 2026 is the target; exact day unset. Asia/Manila is the reporting contract, not the pilot-day approval. | Written date + timezone.                                                          |
| R2  | Explicit release-scope approval for both capabilities | PENDING | No approval reference exists. Issue #87 boxes unchecked; GO approved this run, not release scope.                                            | Product owner approval with date and reference, under the existing freeze policy. |
| R3  | Freeze scope boundaries for both workstreams          | PARTIAL | Scope text exists in #81 ("Must ship", "Outside the system", "Not part of this release"); no committed freeze record exists.                 | Owner confirmation that those boundaries are frozen for v0.2.0.                   |

### Infrastructure and monitoring sources (O0)

| #   | Item                                                                                           | Status  | Evidence / current state                                                                                                                                    | Required proof                                                                              |
| --- | ---------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| I1  | Inventory hosting, URL, database provider, telemetry/metric APIs, retention, deploy-SHA source | PARTIAL | Database provider and local runtime seams are known (§5); host/URL/telemetry/deploy-SHA are UNKNOWN; README's Vercel text is a generic template, not proof. | Dated read-only console inventory and canonical URL.                                        |
| I2  | Choose one independent uptime observer with current terms verified                             | PENDING | No observer selected. No service terms were fetched or claimed in this record.                                                                              | Named service, official terms URL, verification date, non-production retained-outage drill. |
| I3  | Concrete source or `UNAVAILABLE` for every requested health metric                             | PARTIAL | Source matrix in §5. Most host/telemetry readings are UNAVAILABLE or explicitly not implemented; nothing is mocked.                                         | Real source sample per promised metric, or explicit UNAVAILABLE with console link.          |
| I4  | Agree collection period, aggregation, retention, audience, minimum cohort, incidents           | PARTIAL | Canonical domain formulas exist (§6); incident convention reuses GitHub Issues; numeric cohort/retention/limits are PENDING.                                | Approved numeric policy + retention per data class.                                         |
| I5  | Update `docs/16_VALIDATION_AND_ANALYTICS.md` with agreed definitions                           | PENDING | Canonical definitions already live there; no competing formulas were added. Update is planned for the T02 decision slice, not started.                      | Approved definitions recorded in the canonical document.                                    |
| I6  | Confirm migration numbering and no pending/unapplied migrations                                | PARTIAL | Numbering and last local version verified (§10); applied/pending remote state UNKNOWN.                                                                      | Read-only applied-version comparison per environment.                                       |

### Feedback contract freeze (F0)

| #   | Item                                                                 | Status               | Evidence / current state                                                                                                                                                                                             | Required proof                                                                               |
| --- | -------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| F1  | Freeze four categories, labels, prompts, optional/required fields    | PARTIAL              | Categories, sources, classes, fields and limits are written in #81 (§7). Exact label strings, prompt copy and whitespace semantics are PENDING.                                                                      | Approved exact strings and field semantics.                                                  |
| F2  | State that no contact details, account, codes or photos are required | CONTRACT (issue #81) | #81 explicitly excludes contact/account/codes/photos and attachments; participant copy not yet approved.                                                                                                             | Approved notice/copy containing the statement (feeds #91).                                   |
| F3  | Freeze triage state machine and public success/error copy            | PARTIAL              | Transition allow-list, priorities and audit rules are in #81; success, validation, throttle, unavailable and retry copy are PENDING.                                                                                 | Approved copy set; `NEW/REVIEWING/PLANNED/RESOLVED/DISMISSED` confirmed.                     |
| F4  | Decide raw-feedback retention and redaction/deletion procedure       | PENDING              | Human answered "undecided". #81 requires a reviewed procedure and forbids indefinite-by-default retention. The proposal recommends deleting the whole submission at 90 days and keeping separate audit for 180 days. | Approved retention per data class + deletion authority/frequency/verification/backup expiry. |
| F5  | Approve participant-facing privacy notice text                       | PENDING              | No privacy route exists; the exact draft is in proposal §4 and is not approved.                                                                                                                                      | Issue #87 approval of that exact text; #91 renders it after approval.                        |
| F6  | Decide GitHub issue-link convention and aggregate export shape       | PARTIAL              | #81: one validated GitHub issue/PR URL, never auto-created. Exact HTTPS allow-list, cohort suppression and export schema are PENDING.                                                                                | Approved allow-list, export fields/metadata and suppression rule.                            |

**Current conclusion:** of the 15 checklist items, 6 are PENDING, 8 are PARTIAL and 1 is CONTRACT-only; the 2 prerequisites above remain supported. #87 is **not complete**.

## 5. Source inventory (O0)

### 5.1 What the repository actually supports

| Area                  | Observation at the fixed point                                                                                                                                                                                                                                                         | Status                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Application runtime   | Next.js 16.3.1 App Router on Node `>=24 <25`; `output: "standalone"`; container runner starts `node server.js`.                                                                                                                                                                        | VERIFIED (local)                 |
| Local development     | Docker Compose development target on port 3000, mounts the working tree, reads `.env.local`; not a production topology.                                                                                                                                                                | VERIFIED (local)                 |
| Production config     | `src/lib/config/server.ts` validates HTTPS app URL, non-localhost origin, Supabase keys, Resend key/sender and two distinct 32+ character abuse secrets; `instrumentation.ts` runs it at Node startup when `APP_ENV` is `production` or `staging`, or when `NODE_ENV` is `production`. | VERIFIED (local)                 |
| Database              | PostgreSQL via Supabase; migrations, RLS, grants and functions documented in [`docs/DATABASE.md`](../../../DATABASE.md).                                                                                                                                                               | VERIFIED (local)                 |
| Database/Auth access  | Application uses `@supabase/ssr` and `@supabase/supabase-js`; public operations use the server-only service-role client.                                                                                                                                                               | VERIFIED (local)                 |
| Email                 | Resend SDK; `RESEND_API_KEY` and non-default sender required in production; local dev may log safe metadata when the key is absent.                                                                                                                                                    | VERIFIED (local)                 |
| Ingress contract      | Production requires a trusted ingress that strips client-supplied proof/IP headers, injects its own proof, and blocks direct upstream access; app fails closed without it.                                                                                                             | VERIFIED (local)                 |
| CI                    | GitHub Actions runs format, lint, typecheck, unit/contract tests, build; separate DB integration job resets local Supabase and runs migration rehearsal.                                                                                                                               | VERIFIED (local)                 |
| Deployment pipeline   | Docker workflow builds the `runner` target with placeholder public values and `push: false`; no deploy or registry-publish step.                                                                                                                                                       | VERIFIED (local)                 |
| Deploy revision       | No verified runtime deploy-SHA injection/source in the inspected Dockerfile, workflows or config; repository Git SHAs exist but do not identify a deployment.                                                                                                                          | VERIFIED ABSENT (runtime source) |
| Uptime observation    | No external monitor integration or retained-probe code exists.                                                                                                                                                                                                                         | NOT IMPLEMENTED                  |
| APM / telemetry       | No APM or analytics SDK dependency; documented logging is limited to sanitized messages.                                                                                                                                                                                               | PARTIAL                          |
| Domain metrics        | Authoritative-table queries exist in [`docs/16_VALIDATION_AND_ANALYTICS.md`](../../../16_VALIDATION_AND_ANALYTICS.md); only `tracking_events` is dedicated telemetry.                                                                                                                  | VERIFIED (local)                 |
| Internal UI / exports | No internal route group, operator authorization, health endpoint or export exists.                                                                                                                                                                                                     | NOT IMPLEMENTED                  |
| Feedback              | No Feedback table, module, form, inbox or privacy route exists at the fixed point, although issue #81 requires the capability.                                                                                                                                                         | NOT IMPLEMENTED                  |

### 5.2 Deployed facts that remain unknown

| Area                 | Requested reading                                                 | Source today                                                                                               | Status                    | Smallest authorized way to establish                                     |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| Hosting              | Provider, account, region, plan, instance CPU/memory, autoscaling | None in repository                                                                                         | UNKNOWN                   | Read-only host console; record provider/region/runtime, never secrets.   |
| Deployment records   | GitHub deployment and Pages records for this application          | Deployments API returned no records; Pages endpoint 404 (2026-10-28)                                       | UNKNOWN                   | Host/account confirmation; absence here is not proof of no deployment.   |
| Canonical URL        | Production/staging URL and redirect behavior                      | `https://app.tracknologia.com` appears only as an `.env.example` comment                                   | UNKNOWN (example only)    | Owner decision + HTTPS request/redirect readback.                        |
| Database environment | Project ref, region, plan, backups, connection limits             | Supabase client configuration only                                                                         | UNKNOWN                   | Read-only Supabase console inspection; record names, not values.         |
| Applied migrations   | Applied vs pending versions for staging/production                | 18 local filenames                                                                                         | UNKNOWN                   | Read-only `supabase migration list` or dashboard comparison.             |
| Email delivery       | Sender domain verification, delivery/bounce logs, retention       | Resend integration only                                                                                    | UNKNOWN                   | Read-only Resend dashboard; record domain status and log retention.      |
| Ingress              | Actual proxy/CDN, header stripping, direct-upstream blocking      | Contract documented in [`docs/SETUP.md`](../../../SETUP.md) and [`docs/SECURITY.md`](../../../SECURITY.md) | UNKNOWN                   | Read-only configuration review plus a non-production ingress probe.      |
| Request logs / 5xx   | System-wide error rate, latency, 429 counts, log retention        | Host platform logs (if any)                                                                                | UNAVAILABLE               | Host log/metric API enumeration; sample one sanitized reading.           |
| Deploy history       | Which commit is live; rollback target                             | None                                                                                                       | UNAVAILABLE               | Add a release identifier, then read it from a non-production deployment. |
| Uptime               | Probe cadence, failed-check history, coverage                     | None                                                                                                       | NOT IMPLEMENTED / PENDING | Select observer, verify terms, run non-production outage drill.          |
| Supabase diagnostics | Connections, slow queries, lock waits, DB growth                  | Supabase dashboards                                                                                        | UNKNOWN                   | Authorized read-only console/API access with retention recorded.         |
| Analytics storage    | `tracking_events` growth and retention                            | Table + queries                                                                                            | PARTIAL                   | Count via authorized read-only query; retention still PENDING.           |

Per-metric matrix required by #87 (source, coverage, cadence, timeout, freshness, retention, credential scope, failure label, approver) is **not yet fillable**: only source candidates exist. Any promised automated metric without a verified integration must be shown as unavailable.

## 6. Metric definitions and reporting contract

### 6.1 Canonical sources (already documented)

The canonical metric definitions are in [`docs/16_VALIDATION_AND_ANALYTICS.md`](../../../16_VALIDATION_AND_ANALYTICS.md). Do not create competing formulas.

| Question                                       | Canonical source                                |
| ---------------------------------------------- | ----------------------------------------------- |
| Provider creation and type split               | `providers.created_at`, `provider_type`         |
| Repairs created and repeat Provider use        | `repairs.created_at`, `provider_id`             |
| Repair origin split                            | `repairs.origin`                                |
| Request volume, conversion and decision time   | `repair_requests` status and timestamps         |
| Status maintenance and optional waiting states | `repair_status_events`                          |
| Current Repair activity age                    | `repairs`, `repair_updates`                     |
| READY ever reached                             | `repair_status_events.to_status`                |
| Repair completion                              | `repairs.completed_at`                          |
| Successful Tracking views and adopted Repairs  | `tracking_events`                               |
| Feedback trend                                 | Feedback aggregate summary (after #90/#92)      |
| Availability                                   | External independent observer (not implemented) |

### 6.2 Contract statements carried from issue #81

These are the written implementation contract, not owner-approved policy:

- Periods: `today`, `7d`, `30d`, or a bounded custom pilot interval; Asia/Manila boundaries converted to UTC, inclusive start and exclusive end.
- Snapshot metrics (for example current Repair statuses, pending Requests) are labelled separately from event/period counts.
- Request conversion is a **submission cohort**: Requests submitted in the period and accepted, over all Requests submitted in that period.
- Average decision time must state whether it is measured by decision period or submission cohort.
- Tracking views count observations; distinct Repair adoption is a separate count; neither claims unique Customers.
- Completion is a workflow outcome (`repairs.completed_at`), not proven repair quality.
- An empty denominator shows `N/A`, never `0` or a healthy label.
- Small cohorts are suppressed or pooled, including complementary cells.

### 6.3 Numeric policy that is still PENDING

| Question                                                | State   | Downstream effect                                                              |
| ------------------------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| Minimum export cohort size                              | PENDING | #93/#95 cannot finalize exports.                                               |
| Complementary suppression / pooling rule                | PENDING | Risk of re-identification through cross-totals.                                |
| Maximum report interval and bounded custom range        | PENDING | #93 input validation and query budgets.                                        |
| Per-metric retention (reports, aggregates, diagnostics) | PENDING | Retention promise cannot be published.                                         |
| Pilot workload and performance thresholds               | PENDING | Historical v0.1.0 load-plan figures are a starting reference, not an approval. |
| Report audience and access route                        | PARTIAL | Operator-only is the contract; operator identity is #88.                       |

## 7. Feedback contract (F0)

Source: [issue #81](https://github.com/Jacinth091/Tracknologia/issues/81) workstream B. This is the written implementation contract (CONTRACT), not an owner-approved policy set. Policy-dependent text, retention and limits remain PENDING.

### 7.1 Categories and fields (contract)

| Element             | Contract                                                                                                                                                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Categories          | `BUG` (Bug Report), `USABILITY` (Usability), `FEATURE_REQUEST` (Feature Request), `GENERAL` (General).                                                                                                                                                                                                     |
| Sources             | `PUBLIC_TRACKING`, `PUBLIC_REQUEST`, `PUBLIC_FEEDBACK`, `PROVIDER_WORKSPACE`; allow-listed or server-derived.                                                                                                                                                                                              |
| Participant class   | `PUBLIC_SELF_REPORTED_CUSTOMER`, `SHOP_OWNER`, `SHOP_STAFF`, `INDEPENDENT_REPAIRER`; server-derived for Providers.                                                                                                                                                                                         |
| Identity            | Anonymous Customers need no account, contact, Tracking Code, Request Reference or photo. Authenticated Providers use their existing account and Provider context. Persistence stores only the coarse `participant_class` and never participant identity, contact details, codes, repair linkage or photos. |
| Title               | Optional, trimmed, at most 120 characters.                                                                                                                                                                                                                                                                 |
| Message             | Required, nonblank, plain text, at most 2,000 characters; one message for every category.                                                                                                                                                                                                                  |
| Nonce               | UUID per rendered form, `UNIQUE`, makes retries idempotent.                                                                                                                                                                                                                                                |
| Stored metadata     | Category, source, participant class, timestamps; no IP, browser, serial or repair identifiers.                                                                                                                                                                                                             |
| Internal fields     | Bounded internal notes, one validated GitHub issue/PR URL, resolution; internal only.                                                                                                                                                                                                                      |
| Participant promise | Generic success receipt; no response time or SLA promised.                                                                                                                                                                                                                                                 |

### 7.2 Triage state machine (contract)

```text
NEW -> REVIEWING | DISMISSED
REVIEWING -> PLANNED | RESOLVED | DISMISSED
PLANNED -> RESOLVED | REVIEWING | DISMISSED
RESOLVED | DISMISSED -> REVIEWING   (reopen with a reason)
```

- Priority: `NORMAL`, `HIGH`, `CRITICAL`; default `NORMAL`.
- Every change updates state and appends an audit event atomically; optimistic `row_version`; operator derived from the session.
- Original participant text is immutable while retained; only a separately audited privacy redaction may change it, and the approved retention policy may delete the whole submission.
- RLS on; no direct CRUD for `anon`/`authenticated`; a fixed-argument submission RPC is service-role only.

### 7.3 Items still PENDING in F0

| Item                                                            | State   | Consequence                                 |
| --------------------------------------------------------------- | ------- | ------------------------------------------- |
| Exact category label strings and conversational prompts         | PENDING | #91 copy and #92 filters.                   |
| Unicode/emoji counting and whitespace-only semantics agreement  | PENDING | Zod/PostgreSQL parity tests in #89.         |
| Internal note/reason/link length limits and pagination bounds   | PENDING | #89 schema checks and #92 queries.          |
| Feedback rate-limit numbers and source-hint handling            | PENDING | #89 limiter migration and UI behavior.      |
| Success, validation, throttle, unavailable and retry copy       | PENDING | #91 participant surface.                    |
| Exact HTTPS repository/path allow-list (Issues only or PRs too) | PENDING | #92 link validation.                        |
| Raw-feedback retention and deletion authority                   | PENDING | #89 storage policy, #92 procedure, notice.  |
| Participant privacy notice text                                 | PENDING | #87 approval of proposal §4; #91 rendering. |
| Aggregate export shape and minimum cohort                       | PENDING | #93/#95 exports.                            |

## 8. Privacy, retention and export posture

### 8.1 Data minimization already supported

- `tracking_events` stores only Repair correlation and observation time; no code, contact, network, browser, fingerprint, Auth or arbitrary metadata ([`docs/SECURITY.md`](../../../SECURITY.md), [`docs/DATABASE.md`](../../../DATABASE.md)).
- Public abuse control stores an opaque server-keyed HMAC actor key, operation, bounded window and expiry; no raw IP or Tracking Code.
- Logs must not contain raw Tracking credentials or unnecessary customer data ([`docs/OPERATIONS.md`](../../../OPERATIONS.md)).
- Feedback free text is treated as potential personal data; no full-text logging and no mirroring to GitHub (issue #81).

### 8.2 Open privacy decisions

| Decision                                                                                                    | State   | Required before                                           |
| ----------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------- |
| Retention per data class: Feedback submission, review/access/deletion audit, diagnostics, aggregate reports | PENDING | #89 schema/cleanup, #92 procedure, #95 exports, notice    |
| Deletion authority, frequency and verification                                                              | PENDING | #89/#92; must leave a separate minimal audit entry        |
| Backup expiry after deletion (unknown; no immediate-erasure claim)                                          | PENDING | Deployment-specific confirmation; notice publication gate |
| Participant-facing privacy notice text                                                                      | PENDING | #87 approval; #91 rendering                               |
| Minimum cohort and complementary suppression                                                                | PENDING | #93/#95                                                   |
| Export contents/metadata and audit of exports                                                               | PARTIAL | Contract says aggregate counts only; shape PENDING        |
| Legal/compliance basis and external service terms                                                           | PENDING | No legal claim is made here                               |

**No retention period, privacy promise or deletion guarantee is approved by this record.** The human answered "undecided"; it must not be inferred from issue text, plan text or examples.

## 9. Release decision table

The companion [02-DECISION-PROPOSAL.md](02-DECISION-PROPOSAL.md) turns these open rows into concrete PROPOSED choices for owner review. It records no approval and does not narrow #87.

| #   | Question                                  | Existing evidence                                        | Proposed safe direction (if justified)                                                                                                           | Approver / required proof                                                      | Blocks                         |
| --- | ----------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------ |
| D1  | Pilot start date and timezone             | Target November 2026; exact day unset (issue #87)        | Do not schedule; keep November 2026 as target only.                                                                                              | Product owner written date + timezone.                                         | #97, pilot launch              |
| D2  | Release-scope approval                    | Both capabilities required by #81; no approval reference | Keep both capabilities mandatory; apply the freeze policy rather than expanding scope.                                                           | Product owner approval with date/reference.                                    | #88–#97 sequencing, #97 GO     |
| D3  | Scope boundaries                          | #81 Scope                                                | Freeze the written exclusion list as-is.                                                                                                         | Owner confirmation.                                                            | #88, #91, #97                  |
| D4  | Hosting provider and canonical URL        | Generic README Vercel text; example URL only             | Do not choose a vendor; require HTTPS, request logs, deploy revision, rollback and external-probe reachability.                                  | Owner decision + read-only console inventory + URL readback.                   | #94, #97                       |
| D5  | Database environment and access           | Supabase Postgres; project details unknown               | Keep Supabase; record project/region/backup/connection facts before monitoring work.                                                             | Owner/operator console access.                                                 | #93, #94, #96, migration proof |
| D6  | Telemetry and metric APIs                 | No APM; host/Supabase logs only if exposed               | Prefer existing host + Supabase telemetry; add bounded counters only where coverage is otherwise absent.                                         | Access confirmation + one sanitized sample with retention.                     | #93, #94, #95                  |
| D7  | Deploy-SHA source                         | Absent in Dockerfile/workflows                           | Inject a read-only commit SHA at build/deploy and surface it only after #88 authorization.                                                       | Implemented in #94; non-production readback proving the displayed SHA matches. | #94, #97                       |
| D8  | Independent uptime observer               | None                                                     | Select only after verifying current official terms, free-tier limits, history retention and failure retention; no app-only polling.              | Named service + terms URL/date + non-production retained-outage drill.         | #94, #97                       |
| D9  | Health metric source matrix               | Partial (§5)                                             | Publish only real sources; mark the rest UNAVAILABLE with a console link.                                                                        | Read-only access + sanitized samples.                                          | #94                            |
| D10 | Collection/aggregation/retention/audience | Canonical formulas; numeric policy absent                | Adopt the contract labels; defer numbers to approval.                                                                                            | Owner-approved numbers with date.                                              | #93, #95                       |
| D11 | Minimum export cohort + suppression       | Contract requires suppression; number absent             | Require a numeric floor and complementary suppression before any export ships.                                                                   | Approved number + small-cohort test with synthetic rows.                       | #95                            |
| D12 | Incident convention                       | GitHub Issues; `docs/OPERATIONS.md` severity model       | Reuse GitHub Issues with start/end, category, impact, status, resolution and release reference; no second tracker.                               | Lead/owner confirmation.                                                       | #94, #96                       |
| D13 | Feedback fields/states contract           | Issue #81 contract                                       | Freeze the contract as written; treat labels/prompts as copy work.                                                                               | Owner sign-off on remaining strings/semantics.                                 | #89, #90, #92                  |
| D14 | Feedback copy and privacy notice          | None approved                                            | Keep copy plain, no SLA, no identity request; exact notice draft is proposal §4; publish only after #87 approval and #91 implementation.         | Approved exact text (#87); rendered by #91.                                    | #91                            |
| D15 | Feedback retention and deletion           | Undecided                                                | Delete the entire submission at 90 days; keep separate minimal audit for 180 days; no tombstone or identifying aggregate.                        | Approved policy + synthetic deletion test.                                     | #89, #92, #97                  |
| D16 | Feedback issue-link allow-list            | GitHub issue/PR URL, never auto-created                  | Allow only exact HTTPS GitHub issue (and PR if decided) URLs; reject others.                                                                     | Approved allow-list + validation tests.                                        | #92                            |
| D17 | Migration applied state and baseline      | 18 local filenames; remote state unknown                 | Select a Git commit as the rehearsal base only after confirming its applied migration head; a filename or timestamp cannot identify that commit. | Applied-version comparison per environment plus a confirmed baseline SHA.      | #96, #97                       |

## 10. Migration readiness

### 10.1 Local numbering (verified)

18 committed migration files under `supabase/migrations/`, ascending timestamps, first `20260820000001_create_provider_identity.sql`, last `20260905000000_public_tracking_problem_context.sql`. Names are descriptive; no duplicate numbering or obviously out-of-order timestamp was observed in the committed listing.

The list includes `20260825010000_add_tracking_analytics.sql`, `20260826120000_add_durable_public_abuse_control.sql` and `20260905000000_public_tracking_problem_context.sql`, consistent with the documented analytics, abuse-control and Tracking projections.

### 10.2 What is not proven

- Applied versions on `staging` and production: **UNKNOWN**.
- Whether the deployed application matches any commit: **UNKNOWN**.
- Whether any dashboard-only change exists: **UNKNOWN**; [`docs/DATABASE.md`](../../../DATABASE.md) prohibits such changes but cannot prove absence remotely.

### 10.3 Pre-v0.2 upgrade baseline (proposed)

A migration filename or timestamp does not identify a Git commit. The rehearsal base must be a **confirmed Git commit whose applied migration head equals the last pre-v0.2 migration** (`20260905000000_public_tracking_problem_context.sql`); `480ffc57...` is only the recorded destination-baseline candidate. Keep the rehearsal base **PENDING** until release/applied-state confirmation. Verify new v0.2 migration timestamps sort after the confirmed head, and note that a rehearsal whose base already contains the new migrations is **INAPPLICABLE**, not upgrade proof.

### 10.4 Exact non-production proof needed

1. Read-only listing of applied versions for each environment; record date, environment and source.
2. Compare applied versions with the 18 local files; list missing/extra/different versions.
3. On a disposable local Supabase stack: `pnpm db:reset` (fresh install), then `pnpm test:db` on the relevant suites.
4. Run the pending-only upgrade rehearsal against the confirmed Git baseline; record the commit SHA, applied migration head and whether the result is applicable.
5. Never apply, repair or mutate a shared/remote database in this issue.

## 11. Downstream readiness map

| Issue | Can start on current evidence? | Reason / missing input                                                                                                                                                                                                                                                                          |
| ----- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #88   | NOT YET                        | Issue #81's dependency sequence places #88 after #87; #87 remains incomplete. #88 adds `internal_operators`/`internal_access_audit` and provisioning/revocation metadata, so approved audit retention and source policy are relevant; the shared authorization/audit dependency is the blocker. |
| #89   | NOT YET                        | Feedback contract shape exists; retention/deletion (D15) affects storage/cleanup; field limits (D13) unresolved.                                                                                                                                                                                |
| #90   | NOT YET                        | Depends on #89 and #88; contract fields available.                                                                                                                                                                                                                                              |
| #91   | BLOCKED                        | Needs #87 approval of the exact notice and remaining participant copy (D14); #91 renders the approved text.                                                                                                                                                                                     |
| #92   | BLOCKED                        | Needs retention/deletion (D15), link allow-list (D16), operator auth (#88).                                                                                                                                                                                                                     |
| #93   | BLOCKED                        | Needs numeric cohort/period/retention policy (D10, D11) and source confirmation.                                                                                                                                                                                                                |
| #94   | BLOCKED                        | Needs host/URL (D4), telemetry (D6), deploy SHA (D7), observer (D8), metric sources (D9).                                                                                                                                                                                                       |
| #95   | BLOCKED                        | Needs cohort/suppression (D11), export shape (F6), and #93/#94.                                                                                                                                                                                                                                 |
| #96   | BLOCKED                        | Needs #89–#95 plus recovery/migration proof.                                                                                                                                                                                                                                                    |
| #97   | BLOCKED                        | Needs all above plus pilot date (D1), scope approval (D2) and GO decision.                                                                                                                                                                                                                      |

## 12. Explicit missing inputs (owner actions)

1. Pilot start date and timezone.
2. Release-scope approval reference for the two mandatory capabilities.
3. Hosting provider, canonical HTTPS URL, region and read-only console access.
4. Telemetry/metric source access, log retention and deploy-history visibility.
5. Independent uptime observer selection after primary-term verification.
6. Retention per data class, deletion authority, audit lifetime and backup-expiry confirmation.
7. Approval of the exact participant notice draft in the proposal §4 (issue #87), and the remaining Feedback copy; #91 renders the approved text.
8. Minimum export cohort, suppression rule, export fields/metadata.
9. Read-only applied-migration comparison for each environment.

Each input is currently PENDING/UNKNOWN. None is inferred from a plan, example or local default.

### 12.1 Non-production proof required before an item can be marked approved

| Area                | Minimum proof                                                                                                                                              | Must not use                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Uptime observer     | Official terms URL + date, limits/history retention, then a drill where the app is stopped and failed checks remain readable with timestamps and coverage. | App-only polling, production outage. |
| Deploy revision     | A non-production deployment displays a commit SHA matching the intended candidate.                                                                         | Assumed or hard-coded version text.  |
| Telemetry           | One sanitized sample per promised metric with source, cadence, timeout, freshness and retention recorded.                                                  | Raw logs, secrets, participant data. |
| Retention/deletion  | Synthetic personal-data canary deleted through the documented authority, with a separate audit entry and backup treatment.                                 | Real participant submissions.        |
| Export suppression  | Seeded small cohorts produce suppressed or pooled cells, no raw text and safe CSV output.                                                                  | Production export of real cohorts.   |
| Migrations          | Fresh install plus pending-only rehearsal against the recorded baseline, with the baseline and applicability stated.                                       | Shared/remote migration application. |
| Privacy notice/copy | Exact #87-approved text renders with no SLA or identity request (implemented later in #91).                                                                | Draft copy presented as approved.    |

Each proof row must record environment, date, candidate SHA (or none) and reviewer.

## 13. Explicit status

- **Issue #87:** OPEN — NOT COMPLETE.
- **v0.2.0 release:** NOT RELEASE-READY.
- **Approvals recorded by this record:** none.
- **Candidate:** PR-prep repair revision 5; it contains this record plus [02-DECISION-PROPOSAL.md](02-DECISION-PROPOSAL.md) only. Candidate-specific verification results belong to the associated PR/run report.
- **Next action:** the owner decisions in §12 and the companion proposal's §8, then a T02 contract update based on accepted choices. Later implementation follows the accepted issue plans and existing execution authority; this record does not itself authorize new feature implementation. No implementation issue may treat a proposed direction in §9 as approved.

## 14. Verification and limitations of this record

- Built from the dated issue snapshots, the supplied source/config excerpts, and repository documentation at the recorded fixed point.
- No deployed reading, dashboard, API, migration state or external service term was fetched or verified.
- No GitHub write, deployment, drill, migration, purchase, credential change or participant data action was performed.
- Documentation is the only change. Tests were **NOT RUN** by governed Worker policy; the Lead schedules document-format/link/coverage checks.
- A fixed point is not proof of the deployed revision. This record must be re-dated when the accepted `staging` head or any owner decision changes.

## 15. Revision history

| Date       | Revision | Change                                                                                                                                                                      |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-28 | 1        | Initial T01 evidence/decision record. No approvals recorded; #87 remains incomplete.                                                                                        |
| 2026-10-28 | 2        | Bounded repair: #88 audit/retention dependency, Feedback identity split, temporary `_context` provenance, Git-commit migration baseline. Prettier formatting check failed.  |
| 2026-10-28 | 3        | Formatting repair; passed all five independent verification checks including Prettier. No semantic change.                                                                  |
| 2026-10-28 | 4        | PR-prep: removed dependencies on unrelated milestone-plan files, recorded deployment-discovery observations, linked the companion decision proposal. No approval added.     |
| 2026-10-28 | 5        | PR-prep repair: exact participant notice draft, 429 reading corrected to UNAVAILABLE, row-level 90-day deletion, tightened deploy-SHA and health claims. No approval added. |
