# Issue #93 — O2 aggregate validation metrics

**Status: IMPLEMENTED (code, migration, and verification committed on
`fix/93-aggregate-metrics`).** This record is the exact-commit evidence for the
#93 checklist. Owner release review of this record, and owner merge of the
associated PR, remain outstanding and are not required for this document.

- **Prepared:** 2026-10-29; run `20261029-issue93-o2-metrics`.
- **Author:** governed documentation Worker T01-A1 in the approved isolated source
  copy, prepared for Lead and owner review. Implementation verification results
  belong to the associated PR/run report.
- **Run:** `20261101000000_add_internal_validation_metrics.sql`.
- **Companion:** [01-SCOPE-SOURCES-AND-PRIVACY.md](01-SCOPE-SOURCES-AND-PRIVACY.md) and
  [02-DECISION-PROPOSAL.md](02-DECISION-PROPOSAL.md). The metric definitions
  implemented here are the canonical values recorded in
  [`docs/16_VALIDATION_AND_ANALYTICS.md`](../../../16_VALIDATION_AND_ANALYTICS.md).

## 1. Implemented contract

`public.get_internal_validation_metrics(p_operator_user_id uuid,
p_window_start timestamptz, p_window_end timestamptz)` is a
`SECURITY DEFINER` function with `SET search_path = public, pg_temp`, service-role
only (`PUBLIC, anon, authenticated` have no EXECUTE), operator mapping rechecked
under `FOR SHARE`, and a bounded window (end after start, at most 90 Asia/Manila
days). It returns `(dimension, bucket, row_count, interval_seconds)` and adds no
table or column.

The fixed groups are:

| Dimension                      | Buckets                                         | Meaning                                           |
| ------------------------------ | ----------------------------------------------- | ------------------------------------------------- |
| `PROVIDER_ONBOARDED_IN_PERIOD` | `SHOP`, `INDEPENDENT`, `TOTAL`                  | created in window, by type (TOTAL = sum of split) |
| `PROVIDER_ONBOARDED_ALL_TIME`  | per type + `TOTAL`                              | all-time onboarding anchors per type              |
| `ACTIVE_PROVIDER_IN_PERIOD`    | `TOTAL`, `REPEAT`                               | distinct providers with real work in window       |
| `ACTIVE_DAY`                   | `YYYY-MM-DD`                                    | distinct active providers per Manila day          |
| `STAFF_MEMBERSHIP_ACTIVE`      | `TOTAL`                                         | current STAFF memberships                         |
| `SHOP_WITH_STAFF`              | `TOTAL`                                         | distinct shops with staff                         |
| `REPAIR_STATUS_NOW`            | five `repair_status` values                     | current snapshot                                  |
| `REPAIR_CREATED_IN_PERIOD`     | `TOTAL`, `CUSTOMER_REQUEST`, `PROVIDER_CREATED` | origin split                                      |
| `REPAIR_COMPLETED_IN_PERIOD`   | `TOTAL`                                         | completed inside window                           |
| `READY_REACHED_IN_PERIOD`      | `TOTAL`                                         | distinct repairs reaching READY in window         |
| `STATUS_MAINTAINED_IN_PERIOD`  | `TOTAL`                                         | distinct repairs with a non-initial status event  |
| `REQUEST_RECEIVED_IN_PERIOD`   | `TOTAL`                                         | submitted inside window                           |
| `REQUEST_DECIDED_IN_PERIOD`    | `TOTAL`, `ACCEPTED`, `DECLINED`                 | decided inside window (period semantics)          |
| `REQUEST_PENDING_NOW`          | `TOTAL`                                         | undecided snapshot                                |
| `REQUEST_COHORT_IN_PERIOD`     | `RECEIVED`, `ACCEPTED`                          | submission cohort                                 |
| `REQUEST_DECISION_SECONDS`     | `MEAN`                                          | mean submitted→decision seconds over decided      |
| `TRACKING_VIEWS_IN_PERIOD`     | `TOTAL`, `REPAIRS`                              | views in window; distinct repairs viewed          |
| `TRACKING_ALL_TIME`            | `TOTAL`, `REPAIRS`                              | all-time views; distinct repairs viewed           |
| `REPAIR_ALL_TIME`              | `TOTAL`                                         | all-time Repairs (adoption denominator)           |

Window bounds are UTC instants derived by the application from Asia/Manila
calendar days (inclusive start, exclusive end). Fixed periods: `today`,
`7d` (trailing 7 Manila days including today), `30d` (trailing 30), and `custom`
1–90 Manila days. Ratios (`REQUEST_COHORT` conversion, Tracking adoption, mean
decision lag) are computed in the application; an empty denominator is reported as
an explicit `N/A` (null), never as zero.

Feedback counts are not recomputed by this function; they are read only through
the Feedback summary interface (`get_feedback_count_summary`) with the same
bounded window.

## 2. Verification performed

- Migration applied on the local Supabase stack through
  `npx supabase db reset`; no migration error.
- Unit suite (`src/features/internal-operations/metrics*.test.ts`,
  `metrics.test.ts`): period resolution (Manila day boundaries), fixed-group
  projection, ratio null-on-empty-denominator, row schema guards — all green.
- Database integration suite (`tests/integration/internal-metrics.db.test.ts`):
  - Function grant matrix: `anon` and `authenticated` cannot EXECUTE; the
    service-role caller that names an unknown or disabled operator mapping is
    denied by the `FOR SHARE` recheck.
  - Exact seeded multi-Provider snapshot inside one REPEATABLE READ transaction
    that ends `ROLLBACK`: seeded Manila-midnight boundaries, cohort vs
    period separation, origin split, READY/maintenance counts, completion, Staff
    footprint, repeat activity, decision mean, and Tracking ratios.
  - Typed full-circle projection: fixed rows validate through the application
    row schema and project into the typed metrics output.
- Performance: `EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON)` of
  `get_internal_validation_metrics` over a pilot-shaped local load returned one
  `Function Scan` with `actual rows=29 loops=1` and **Execution Time 15.822 ms**.
  The function is a single set-based statement, so no per-row query pattern is
  possible; the measured plan shape and time are recorded here as the #93
  non-N+1 evidence.

## 3. Residual owner-review items

- Owner merge of the #93 PR.
- Period-selection product behavior for the internal dashboard (#95 remains the
  consuming screen; the #87 owner decisions gate hosted migration/deployment).
