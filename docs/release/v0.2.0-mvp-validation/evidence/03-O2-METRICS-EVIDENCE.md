# Issue #93 — aggregate metrics behavior and verification

This record describes the implemented O2 contract and its discriminating tests.
Exact-head pass/fail evidence belongs to [PR #106](https://github.com/Jacinth091/Tracknologia/pull/106)
and its linked Actions jobs. Implementation and test source are not substitutes
for an executed fresh/upgrade database suite or owner release approval.

Canonical definitions: [Validation and Analytics](../../../16_VALIDATION_AND_ANALYTICS.md).
Owner decisions remain in [the #87 proposal](02-DECISION-PROPOSAL.md); proposed
retention, pilot dates, monitoring sources and workload targets are not approved
by this implementation.

## Contract

`getValidationMetrics` returns fixed aggregate sections for Provider onboarding,
activity/repeat days, current Staff footprint, Repair origin/lifecycle/current
statuses, Request events/submission-cohort conversion/decision time, Tracking
views/adoption, and Feedback trends. Provider/Repair/Request IDs stay inside
SQL; no raw rows, messages, contact details or credentials enter the report.

The domain RPC is service-role-only, checks the enabled operator mapping under
`FOR SHARE`, and uses one set-based aggregate statement. Its fixed rows include
`dimension`, `bucket`, `row_count`, `interval_seconds` and a common `as_of`
captured after the access lock. Period observations are capped at that database
read time. The feature requires a successful access audit, validates complete
allowlisted result groups, computes ratios with null for an empty denominator,
and zero-fills the bounded daily series.

Windows are today/7d/30d/custom, up to 90 Manila calendar days. Future-only
windows, future days beyond the next Manila midnight, malformed bounds and
extra query fields are rejected. Feedback keeps its accepted 31-day query
limit: disjoint batches cover the requested report window, and the report
labels their independent generation timestamps. A failed batch withholds the
whole Feedback section rather than presenting partial counts. Available domain
metrics remain labelled; authorization failure denies the whole report.

Current status and membership counts are current snapshots. Retention coverage
is explicitly limited to retained rows; Tracking observations are not unique
people. This adds no participant endpoint, operator provisioning or deployment.

## Regression tests

- Metrics unit/contract tests use the real Feedback interface and schema, with
  only trusted auth/client seams mocked. They cover 31/32/62/90-day windows,
  31+31+28 batching without gaps, partial batch failure, future rejection,
  null/empty/malformed/incomplete domain rows, separate source freshness,
  database `as_of`, exact effective-end clamping and zero-filled days.
- The PostgreSQL fixture runs in one rolled-back `REPEATABLE READ` session,
  with a fixed past Manila window `[2026-10-19, 2026-10-22)`. It seeds a pending
  baseline before reading, then fixture rows, proving that global snapshots
  include existing state while after-minus-before counts isolate the fixture.
  Means and ratios are compared to the appropriate raw values, not subtracted.
- SQL tests cover grants, missing/disabled operators, finite/aligned windows,
  the 90-day bound, current-day future-observation exclusion and shared read
  timestamps. The full fresh and pending-only upgraded suites must both pass.

## Performance evidence and limits

The test adds 400 synthetic Repairs for a representative local query sample,
asserts a finite measured execution time below a 5-second regression ceiling,
and emits that timing as safe test output. This is not an approved pilot
workload or production SLO. An outer Function Scan does not expose the inner
query plan and alone cannot establish the number of internal queries; the
set-based SQL source is inspected separately. No speculative index, cache,
rollup table or warehouse was added.

The author's earlier 15.822 ms measurement and local pass claims apply to the
original candidate only. Its upgraded CI suite failed because the typed
projection assumed an empty database (`pendingNow=3` versus actual 4). The
corrected fixture deliberately includes a pre-existing pending request, keeping
that regression sensitive on both fresh and upgrade paths. New results must be
read from the corrected candidate's actual CI; no local PostgreSQL pass is
claimed when Docker is unavailable.
