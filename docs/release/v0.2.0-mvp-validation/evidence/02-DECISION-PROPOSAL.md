# Issue #87 — Decision proposal

**Status: PROPOSED / OWNER APPROVAL PENDING.** This is not an approval, not an implementation claim and not a release-readiness claim. No #87 checklist item is closed by this document.

- **Prepared:** 2026-10-28; proposal revision 1 (PR-prep repair candidate).
- **Author:** governed documentation Worker T01-A1 in the approved isolated source copy, prepared for Lead and owner review. Candidate-specific verification results belong to the associated PR/run report.
- **Run:** 20261028-issue87-validation-readiness.
- **Companion inventory:** [01-SCOPE-SOURCES-AND-PRIVACY.md](01-SCOPE-SOURCES-AND-PRIVACY.md). That record owns the evidence and 17-row crosswalk; this record owns concrete proposed choices.
- **Basis:** [Issue #81](https://github.com/Jacinth091/Tracknologia/issues/81) (contract), [Issue #87](https://github.com/Jacinth091/Tracknologia/issues/87) (decisions), and committed repository documents, including the canonical metric definitions in [`docs/16_VALIDATION_AND_ANALYTICS.md`](../../../16_VALIDATION_AND_ANALYTICS.md). No competing metric formula is introduced.

## 1. How to review this proposal

- Every unresolved point below has either an exact recommended choice with a reason, or an explicit statement of the evidence that cannot be invented.
- **PROPOSED** means nothing is implemented or approved. Do not cite a proposal as policy.
- Approval requires an owner comment with a date and reference against the item. Rejection or a different choice is equally valid.
- After owner approval, the T02 update freezes the accepted values in the canonical documents and the issue. This record does not perform that update.
- Numbers are proposals for review, not legal-compliance claims or measured facts.

## 2. Release scope and pilot target

| Item               | Proposed choice                                                                                                                                                                                                             | Reason                                                                        | Approval |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| Scope              | Retain **both** mandatory capabilities from #81 — Internal Operations & Monitoring and Participant Feedback — plus the integrated release gate. Retain #81's written exclusions. Do not narrow #87 to this partial package. | #81 makes both capabilities mandatory and fixes the release-gate conditions.  | PENDING  |
| Pilot date         | Keep **November 2026** as the target only. Do not set a day or timezone until the owner supplies one.                                                                                                                       | #87 explicitly says not to assume November 1; the human answered "undecided". | PENDING  |
| Reporting timezone | Use Asia/Manila calendar boundaries for day/week/pilot reporting, converted to UTC for storage and API output: start inclusive, end exclusive.                                                                              | This is the existing #81 contract, not a new formula.                         | CONTRACT |

Scope approval and pilot date remain missing inputs. Nothing here schedules a pilot.

## 3. Feedback contract proposal

### 3.1 Categories, labels and prompts

| Category value    | Label           | Prompt                                                                |
| ----------------- | --------------- | --------------------------------------------------------------------- |
| `BUG`             | Bug Report      | "What were you trying to do? / What happened? / What did you expect?" |
| `USABILITY`       | Usability       | "What were you trying to do, and what made it harder than expected?"  |
| `FEATURE_REQUEST` | Feature Request | "What would you like to be able to do, and why?"                      |
| `GENERAL`         | General         | "What would you like us to know?"                                     |

The four category values and labels are the #81 contract. The Bug Report prompt is quoted from #81; the other three prompts are **PROPOSED exact strings** for review. The prompt is guidance only; one message field holds the submission.

### 3.2 Fields and validation

| Field              | Proposed rule                                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `category`         | Required; exactly one of the four values above.                                                                                                                                                                                                            |
| `title`            | Optional. Boundary-trimmed; whitespace-only becomes null. At most **120 Unicode code points** after trim.                                                                                                                                                  |
| `message`          | Required. Plain text. Boundary-trimmed; must contain at least one non-whitespace character. At most **2,000 Unicode code points** after trim. Internal line breaks are preserved, not collapsed.                                                           |
| `source`           | Fixed four-value allow-list: `PUBLIC_TRACKING`, `PUBLIC_REQUEST`, `PUBLIC_FEEDBACK`, `PROVIDER_WORKSPACE`. Server-derived or server-checked; never trusted from the browser.                                                                               |
| Participant class  | Anonymous public submission is `PUBLIC_SELF_REPORTED_CUSTOMER` (self-reported). Authenticated Provider submission derives `SHOP_OWNER`, `SHOP_STAFF` or `INDEPENDENT_REPAIRER` from `requireProviderContext()`. Browser-supplied IDs or roles are ignored. |
| `submission_nonce` | UUID per rendered form, preserved across retries; unique. Replaying it returns the same generic success without a duplicate or prior-content disclosure.                                                                                                   |
| Identity fields    | None. No name, email, phone, Tracking Code, Request Reference, provider/user ID, photo or attachment is requested or accepted. The UI still asks people not to include personal details, and every message is treated as potential personal data.          |

**Boundary trim, stated once for both layers:** trim only ASCII space `U+0020`, horizontal tab `U+0009`, carriage return `U+000D` and line feed `U+000A` at the start and end. Do not collapse internal whitespace. Do not treat non-breaking space, ideographic space or zero-width characters as trim characters. Proposed reference expressions: JavaScript `value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "")`; PostgreSQL `btrim(value, E' \t\r\n')`. Later cross-layer fixtures must prove these are equivalent; the expressions are not a claim that parity exists today.

**Blank check:** after boundary trim, reject a message whose every code point has the Unicode `White_Space` property. A check that only compares the trimmed string with `""` is insufficient for values made solely of non-ASCII whitespace.

**Length counting:** count Unicode code points after boundary trim. JavaScript must count code points (for example by iterating the string), not UTF-16 code units or bytes; PostgreSQL `char_length` counts code points. Astral emoji therefore count as one each.

**Cross-layer parity is not yet proven.** The Zod schema, RPC guard and database CHECK must use the same rules. F1 must add fixtures at 120/121 and 2,000/2,001 code points, plus tabs, CRLF, astral emoji, combining marks, non-breaking space and a message made only of Unicode whitespace. Until those fixtures pass, this section is a proposal, not a verified invariant.

### 3.3 Public rate limit

- Proposed public budget: **5 attempts per 600 seconds** per privacy-safe actor key for `feedback_submit`.
- Use the existing durable shared limiter, not an in-memory or app-only counter. Rate-limit before parsing and before any write, as #81 requires; spoofed actor, status and priority fields are ignored.
- The actor key is a server-side HMAC of the network identifier (or another approved coarse key) using a server-only secret. Do not store the raw IP address or expose the key. Do not log the submitted text.
- A normal throttled response has retry guidance (copy in §3.6). Do not reveal the exact remaining budget or another participant's activity.
- Authenticated Provider submissions may use an anti-spam budget where appropriate; they must not bypass the public limit.
- This limiter, its migration and its tests **do not exist yet** for Feedback.

### 3.4 Triage transitions and priority

The following is the exact #81 transition allow-list. No other transition is permitted:

- `NEW → REVIEWING | DISMISSED`
- `REVIEWING → PLANNED | RESOLVED | DISMISSED`
- `PLANNED → RESOLVED | REVIEWING | DISMISSED`
- `RESOLVED | DISMISSED → REVIEWING` (reopen, with a mandatory reason)

Each change updates state and writes an append-only event atomically, with optimistic `row_version` concurrency and an operator derived from the authenticated session. No participant notification is sent.

Priority is operator-only, defaults to `NORMAL`, and is limited to `NORMAL | HIGH | CRITICAL`. A participant cannot set it; a browser-supplied value is ignored. Every change records before/after values in the audited event.

#81 does not define the operational meaning of `HIGH` and `CRITICAL`. **Proposed:** `HIGH` means a core flow is meaningfully degraded but a workaround exists; `CRITICAL` means pilot participation is blocked or there is a security, privacy or data-integrity risk. The owner may keep the enum and reject these definitions; without approval, operators use documented judgment rather than an invented service level.

**Submitted text is immutable** except for an explicit privacy redaction or deletion through the reviewed authority in §4. Every redaction/deletion is audited; text is never silently edited or mirrored to GitHub. A “resolution” is represented by the terminal status plus a bounded audited reason and internal notes; no separate resolution column is proposed without owner approval.

### 3.5 Internal bounds and pagination

- `internal_notes`: nullable; when present, boundary-trimmed and at most **2,000 code points**; whitespace-only becomes null. Internal only, never exported.
- Reopen reason and redaction/deletion reason: mandatory, boundary-trimmed, **1–500 code points**, nonblank. Reasons must not copy the participant's sensitive text.
- `linked_issue_url`: nullable; at most one URL, never auto-created. Accept exactly:
  `^https://github\.com/Jacinth091/Tracknologia/(issues|pull)/[1-9][0-9]*$`
  Reject userinfo, port, query, fragment, trailing slash, other hosts, other repositories and leading-zero numbers.
- Inbox page size: default **25**, maximum **50**, stable `created_at DESC, id DESC` order.
- Report range: at most **90 Asia/Manila calendar days** per request. Snapshot metrics are labelled separately from period counts.

### 3.6 Exact participant copy

| Situation               | Exact copy                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Success receipt         | "Thanks — your feedback was received. We can't reply to every submission."                                       |
| Required message        | "Enter a message before submitting."                                                                             |
| Message too long        | "Your message is too long. Keep it to 2,000 characters or fewer."                                                |
| Title too long          | "Your title is too long. Keep it to 120 characters or fewer."                                                    |
| Throttled               | "Too many submissions. Wait a few minutes and try again."                                                        |
| Temporarily unavailable | "Feedback is temporarily unavailable. Try again later."                                                          |
| Ambiguous retry         | "We couldn't confirm that your feedback reached us. Retrying is safe and reuses the same submission identifier." |

The success copy promises no reply and no response time. The ambiguous copy does not claim the submission was saved; it preserves the nonce so a retry is idempotent if the first attempt committed. No copy promises an SLA. None of §3 is implemented at the inspected fixed point.

## 4. Retention, redaction and privacy proposal

These values are **proposals**, not legal advice or proof of compliance.

| Data class                                                                                                                                     | Proposed retention                         | Then                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Feedback submission (the entire row: title, message, category, source, participant class, timestamps, status/priority and submission metadata) | **90 days from submission** (`created_at`) | Delete the entire submission, including its text and metadata. Do not retain a submission tombstone or identifying aggregate. |
| Feedback review, access and deletion audit                                                                                                     | **180 days from the event**                | Keep a separate minimal audit only; no raw text and no copy of the submission.                                                |
| Sanitized diagnostics (bounded counters)                                                                                                       | **7 days**                                 | Delete. No raw message text, identity fields or participant-level data.                                                       |
| Generated aggregate exports                                                                                                                    | **30 days in controlled storage**          | Delete the generated file and temporary copies. No indefinite retained export copies.                                         |

- **Deletion is row-level:** at 90 days the complete Feedback submission is deleted, including text and metadata. Deleting the whole row, not retaining a redacted or empty submission, is the proposed default. The exact future FK/audit implementation belongs in #89/#92 and must preserve the required audit without retaining raw text.
- Existing business records keep their existing product retention. A monitoring or Feedback cleanup job must not purge Repair, Request, Provider or Tracking records.
- **Tracking-event retention and provider backup policy remain PENDING.** They require owner/source confirmation; no number is proposed here.
- **No new aggregate storage is proposed.** Aggregates are computed from authoritative tables on demand. An export is a generated artifact, not a new source of truth.
- **Authority:** a designated internal operator (the O1 role) may delete under this policy. The operator cannot delete their own audit trail. A manual runbook must name the authority without embedding personal data in migrations.
- **Daily cleanup:** a scheduled cleanup owned by Operations, idempotent and logged. It records counts and failures, never original text. Readback verification confirms that overdue rows are zero or explains any remainder before the run is called successful.
- **Minimal audit:** actor, action, timestamp, reason and only the minimum non-text reference needed to link audit events; no original sensitive text and no participant identity. A reason that would repeat personal data is rejected or redacted.
- **Backups:** provider-specific backup expiry is **UNKNOWN**. The 180-day audit/ledger period does not establish backup expiry, and a 180-day ledger cannot be claimed to cover an unknown longer-lived backup. No promise of immediate or verified backup erasure is made. After any restore, reapply the deletion ledger before restoring access to the restored data.
- **No claim that cleanup exists today.** The Feedback tables, cleanup job and audit procedure do not exist at the inspected fixed point.

### 4.0 Exact participant privacy notice draft

**Status: PROPOSED — MUST NOT PUBLISH BEFORE APPROVAL AND IMPLEMENTATION.** Issue #87 owns approval of this exact text; #91 implements and renders the approved version. Any change to the text requires new owner approval.

> When you send feedback, we collect the category, any title you add, your message, the part of the service you sent it from, whether you are an anonymous customer or an authenticated Provider (and, for Providers, the existing Provider role derived from your session), and the time of submission. Customers can submit without an account. Providers use their existing account and Provider context. We do not ask for your name, email address, phone number, Tracking Code, Request Reference or photos. Please do not include personal details. Your message is free text and may contain personal data even when you do not intend it to.
>
> Only designated internal operators can read feedback. Providers and the public cannot see it. We use a short-lived opaque key, not your raw IP address, to prevent abuse. Reporting uses aggregate counts only.
>
> We delete the entire feedback submission, including its text and metadata, 90 days after submission. We keep a separate minimal review, access and deletion audit for 180 days. Backup expiry depends on the deployment provider and is not yet confirmed; we cannot promise immediate erasure from backups. We do not promise a response or a service level.

The notice must not be published until the retention policy is approved and implemented, and until deployment-specific backup retention is confirmed. This proposed text makes no claim that a reviewed backup policy already exists.

### 4.1 Export shape and small-cohort protection

A generated aggregate export may contain only:

- safe aggregate `metric_key`;
- `value` and `unit`;
- `period_start`, `period_end` and `timezone` (Manila boundaries, UTC instants);
- `aggregation_kind` (snapshot, event count, submission cohort or average, as defined by the canonical metric);
- `coverage` (complete, partial or unavailable), `source` and `freshness`/`as_of`;
- `suppression` (none, suppressed or pooled);
- `generated_at` and a schema revision.

No participant IDs, Feedback IDs, provider IDs, row IDs, raw text, free-text dimensions or identifying combinations. No row-level export.

- Minimum cohort: **5**. Suppress cells with 1–4.
- Apply complementary suppression so a suppressed cell cannot be reconstructed by subtracting published totals. Pool only when the pooled group is at least 5 and pooling does not reveal a smaller group.
- If safe suppression would leave the report unusable, show the metric as unavailable rather than leaking a small cell.
- CSV safety: quote text fields; prefix any cell beginning with `=`, `+`, `-`, `@`, tab or carriage return with an apostrophe; export UTF-8. Counts are numeric and controlled metric keys are allow-listed.
- Suppression and export generation are **not implemented**.

## 5. Independent uptime observer proposal

**Candidate: UptimeRobot Free. Selection is PENDING; nothing has been signed up or configured.**

Official sources verified by the Lead on 2026-10-28 (concise paraphrase, one source per fact):

1. [Who should use UptimeRobot's Free plan?](https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan) — the Free plan permits commercial use, provides 50 monitors and 5-minute checks, and requires no credit card.
2. [Data retention](https://help.uptimerobot.com/en/articles/11360873-what-is-uptimerobot-data-retention-and-how-does-it-work-in-different-plans) — the Free plan retains monitoring data for 3 months.
3. [Monitoring interval](https://help.uptimerobot.com/en/articles/11360876-what-is-a-monitoring-interval-in-uptimerobot) — rechecks during a long outage can be spaced further apart than the normal interval.

**Proposed configuration:**

- Private account; no public status page. A public page would disclose service state and is not needed for the pilot.
- One future readiness URL, the coarse `/api/health` endpoint implemented later in #88/#94. It returns 200/503 and a timed DB probe, with no topology or participant secrets. No Tracking Code, provider slug or private identifier in the URL.
- Treat a missed check or stale observation as `UNAVAILABLE`, never as uptime or zero. Display the last successful check and the observed coverage.
- App-driven polling is not an independent observer, because it fails with the app.

**Before operational acceptance, confirm:** provider API/history access and limits; the timeout setting actually used; effective recheck cadence during an outage; geographic/coverage behavior; private-account permissions and 2FA; retention of failed-check history; and retained-outage evidence. Do not assume a timeout, API limit or check granularity beyond the sourced facts. Selecting a candidate is not proof that the observer works; that requires a later non-production outage drill.

## 6. Metric matrix proposal

This matrix distinguishes the actual current source from a proposal. No sanitized sample, deploy SHA or health reading is fabricated here.

| #81 metric                                                   | Actual source now                                                                                                                                         | Proposed cadence, timeout, staleness and retention                                                                                                                                                         | Current status           |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Availability (external)                                      | None                                                                                                                                                      | Observer check every 5 minutes; timeout to be confirmed against the provider; stale after 2 missed checks (proposed 10 minutes); Free-plan history 3 months                                                | UNAVAILABLE              |
| Readiness (`/api/health`)                                    | None                                                                                                                                                      | On-demand 200/503 with a timed DB probe (proposed 3-second probe timeout); no scheduled scrape or stored history by default                                                                                | NOT IMPLEMENTED          |
| DB reachability                                              | Supabase dashboard only; no authorized reading captured                                                                                                   | Health probe plus read-only console check; on demand; no separate retention                                                                                                                                | UNAVAILABLE              |
| Last external observation                                    | None                                                                                                                                                      | Observer timestamp displayed with coverage; retained per provider history                                                                                                                                  | UNAVAILABLE              |
| Sample age                                                   | None                                                                                                                                                      | Derived at view time from the last observation; stale threshold 10 minutes proposed                                                                                                                        | UNAVAILABLE              |
| Release                                                      | No verified runtime deploy-SHA injection/source at inspected baseline; repository Git SHAs exist but do not identify a deployment                         | Inject a read-only commit SHA at build/deploy and display it (to be implemented by #94, not present); per deployment; host history only if exposed                                                         | UNAVAILABLE              |
| Errors (bounded, per operation category)                     | No APM; host logs unknown                                                                                                                                 | Fixed categories `tracking_lookup`, `request_submit`, `repair_mutation`, `provider_page`, `feedback_submit`; best-effort counters outside business transactions; sanitized retention 7 days                | UNAVAILABLE              |
| Latency (bounded)                                            | No APM; host logs unknown                                                                                                                                 | Bounded buckets per instrumented category; 7-day sanitized retention; no raw request data                                                                                                                  | UNAVAILABLE              |
| 429 counts per operation category                            | No retained 429 event history; limiter rows store `request_count` and expired buckets are deleted or reset, so they cannot reconstruct historical denials | Bounded denial counters or host telemetry per operation, with explicit coverage, independent from enforcement rows; 7-day retention; implementation and source choice OPEN; no new storage design asserted | UNAVAILABLE              |
| Dependency failures                                          | No dependency probe; Resend status unknown; DB only via console                                                                                           | Per-check DB and dependency status; unknown when not actually probed; 7-day sanitized retention                                                                                                            | UNAVAILABLE              |
| Deploy / resource status                                     | Host platform unknown; no reading captured                                                                                                                | Only if the host exposes it; otherwise `UNAVAILABLE` with a console link; host retention                                                                                                                   | UNAVAILABLE              |
| Providers onboarded / type split                             | `providers` table; canonical SQL documented                                                                                                               | On-demand snapshot/period query; no new retention; report range ≤90 Manila days                                                                                                                            | PARTIAL (no internal UI) |
| Providers doing real work / repeat activity                  | `repairs`, `repair_requests`, `repair_status_events`, `repair_updates`                                                                                    | On-demand per canonical definitions; no new event stream                                                                                                                                                   | PARTIAL                  |
| Staff footprint                                              | `provider_memberships`                                                                                                                                    | On-demand count of active STAFF memberships and Shops with Staff; not a work claim                                                                                                                         | PARTIAL                  |
| Repairs created/completed, READY reached, current statuses   | `repairs`, `repair_status_events`                                                                                                                         | On-demand; snapshots labelled separately from event counts                                                                                                                                                 | PARTIAL                  |
| Status-maintenance adoption / Repair origin split            | `repair_status_events`, `repairs.origin`                                                                                                                  | On-demand per canonical definitions; distinct Repairs with a non-initial status event; origin split is not a separate event stream                                                                         | PARTIAL                  |
| Requests received/decided/pending, conversion, decision time | `repair_requests`                                                                                                                                         | On-demand; submission cohort for conversion; N/A when the denominator is zero                                                                                                                              | PARTIAL                  |
| Tracking views / adopted Repairs                             | `tracking_events`                                                                                                                                         | On-demand; repeat views do not create a unique-customer claim                                                                                                                                              | PARTIAL                  |
| Feedback trend                                               | None (Feedback tables not implemented)                                                                                                                    | Aggregate counts by category and state through the Feedback summary interface only; retention and deletion §4                                                                                              | NOT IMPLEMENTED          |
| Day/week/pilot trends                                        | Same canonical tables                                                                                                                                     | Asia/Manila day/week boundaries, start inclusive, end exclusive; maximum 90-day range                                                                                                                      | PARTIAL                  |

**Incident convention (proposed):** use one GitHub issue per incident with start and end (UTC plus Manila display), category, impact, status, resolution and release reference. Never paste participant text, identity data or secrets into an incident. Do not create a second tracker.

## 7. Migration and release evidence proposal

- The upgrade rehearsal base must be a **confirmed Git commit whose applied migration head matches the last pre-v0.2 migration**, not a filename or timestamp. `480ffc57...` remains the recorded destination-baseline candidate, not a confirmed applied-migration baseline.
- Required proof: read-only applied-version listing for each environment; comparison with the committed `supabase/migrations/` files; fresh `pnpm db:reset` plus `pnpm test:db`; then a pending-only rehearsal against the confirmed base. Record environment, date, base SHA and whether the rehearsal is applicable.
- No remote or shared database is to be applied to, repaired or mutated in #87. Applied state, host, URL and live deploy SHA remain **UNKNOWN**.
- A deployment record or Pages 404 observed on 2026-10-28 is not proof that no application exists elsewhere.

## 8. Approval checklist

No box below is checked. Each approval must cite a date and reference.

| #   | Decision                               | Proposed choice                                                                                   | Owner approval (date / reference) |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | Release scope                          | Both capabilities plus release gate; #81 exclusions retained                                      | PENDING                           |
| 2   | Pilot date and timezone                | November 2026 target only; exact date/timezone unset                                              | PENDING                           |
| 3   | Feedback categories, labels, prompts   | §3.1 exact strings                                                                                | PENDING                           |
| 4   | Feedback fields, bounds, trim and copy | §3.2, §3.5, §3.6                                                                                  | PENDING                           |
| 5   | Triage transitions and priority        | §3.4 exact allow-list; proposed HIGH/CRITICAL meaning                                             | PENDING                           |
| 6   | Public rate limit                      | 5 per 600 seconds with the durable shared limiter                                                 | PENDING                           |
| 7   | Retention per data class               | 90 / 180 / 7 / 30 days; tracking and backups still PENDING                                        | PENDING                           |
| 8   | Privacy notice exact text              | Exact §4 draft; #87 approves, #91 implements/renders; retention and backup gate must be satisfied | PENDING                           |
| 9   | Uptime observer                        | UptimeRobot Free, private, one readiness URL                                                      | PENDING                           |
| 10  | Metric sources and cadence             | §6 matrix; unknowns stay UNAVAILABLE                                                              | PENDING                           |
| 11  | Export cohort and schema               | Minimum 5, complementary suppression, §4.1 fields                                                 | PENDING                           |
| 12  | Incident convention                    | GitHub issues with the listed fields, no participant text                                         | PENDING                           |
| 13  | Migration baseline and applied state   | Confirmed commit plus read-only comparison; no mutation                                           | PENDING                           |

**Evidence still needed to finish #87:** host/provider, canonical URL, read-only telemetry and deploy-history access; applied migration state per environment; approved retention/deletion and the exact §4 notice (approved by #87, rendered by #91); observer terms confirmation and later drill; exact copy approval; export suppression test with synthetic rows; and the remaining owner approvals above.

## 9. Explicit status

- **Issue #87:** OPEN — NOT COMPLETE.
- **v0.2.0 release:** NOT RELEASE-READY.
- **Approvals recorded here:** none.
- **Implementation represented here:** none. This proposal creates no code, migration, table, endpoint, monitor or policy.
- **Next action:** owner review of §8. T02 canonical updates and #88–#97 implementation depend on the accepted choices and approved contracts in the issue plans; later work follows existing execution authority. This document does not itself authorize new feature implementation. No unchecked #87 item is marked done, and #87 is not narrowed to this partial package.
