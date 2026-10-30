# 16 — Validation and Analytics

Tracknologia is a FreLean MVP. Instrumentation exists to answer product
hypotheses, not to build an analytics suite.

## Measurement strategy

Authoritative domain tables are the source for Provider, Request, Repair,
origin, lifecycle, and completion measurements. Feature 06 does not duplicate
those facts into a generic event stream. Only successful public Tracking views
use dedicated `tracking_events` rows because no domain table otherwise retains
that observation.

Unless a query adds an explicit time window, its result is an all-time pilot
count. Small-pilot results require operational context and must not be presented
as statistically representative.

## Canonical metric sources

| Validation question                               | Source                                  |
| ------------------------------------------------- | --------------------------------------- |
| Provider creation and type split                  | `providers.created_at`, `provider_type` |
| Repairs created and repeat Provider use           | `repairs.created_at`, `provider_id`     |
| Repair origin split                               | `repairs.origin`                        |
| Request volume, conversion, and decision time     | `repair_requests` status/timestamps     |
| Status maintenance and optional waiting-state use | `repair_status_events`                  |
| Current Repair activity age                       | `repairs`, `repair_updates`             |
| READY ever reached                                | `repair_status_events.to_status`        |
| Repair completion                                 | `repairs.completed_at`                  |
| Successful Tracking views and adopted Repairs     | `tracking_events`                       |

Failed or rolled-back operations do not create contradictory analytics because
the queries read only committed authoritative state.

## Internal operator metrics (O2)

The internal aggregate metrics behind the operator dashboard are computed by the
service-role-only `public.get_internal_validation_metrics(p_operator_user_id,
p_window_start, p_window_end)` function over the authoritative tables above. This
section fixes the canonical definitions the function implements; no competing
formula may be introduced.

- **Periods:** `today`, `7d`, `30d`, or a bounded custom interval of 1–90 Asia/Manila
  days; start inclusive, end exclusive, bounds converted to UTC. An empty
  denominator is reported as an explicit `N/A`, never zero. Future-only windows
  and ends beyond the next Manila midnight are rejected. Period observations
  stop at the earlier of the requested end and the database-generated `asOf`.
  The 90-day bound is a technical limit; #87's pilot/retention approval remains
  separate.
- **Providers onboarded:** created inside the period, split `SHOP` / `INDEPENDENT`
  with a separate cumulative all-time split. A Provider created at the inclusive
  start edge is inside the period.
- **Providers doing real work:** distinct providers with ≥1 Repair creation, Request
  decision, non-initial status change, or Customer Update during the period.
- **Repeat activity:** those providers active on ≥2 distinct Asia/Manila calendar
  days in the period.
- **Staff footprint:** current `STAFF` memberships and distinct shops with staff
  (snapshots, not windowed).
- **Current Repair statuses:** snapshot by `current_status`, as of now.
- **Repair lifecycle:** created inside the period (with `CUSTOMER_REQUEST` /
  `PROVIDER_CREATED` split and cumulative all-time), completed inside the period,
  distinct repairs reaching `READY` inside the period, and distinct repairs with a
  non-initial status event inside the period.
- **Requests:** received inside the window; decisions inside the window
  (`ACCEPTED` / `DECLINED`); undecided snapshot; conversion computed over the
  submission cohort (submitted in window and accepted), independent of when the
  decision landed; mean submitted→decision seconds over decisions made in the
  window.

Reports include every requested calendar day, zero-filled where no activity was
observed. Current status and membership snapshots describe retained current
state at the database read, not historical state at a custom period's end.
Coverage is labelled `RETAINED_ROWS_ONLY`; no claim of complete lifetime history
or approved retention is made. Tracking measures successful views and distinct
Repairs, never unique people.

Feedback is composed only through `getFeedbackAggregateSummary`, in disjoint
batches of at most 31 days so the accepted Feedback contract stays unchanged.
The report labels the batches' independent generation-time range; it does not
claim an atomic snapshot shared with the domain query. Feedback failure returns
an explicitly unavailable section (`feedback: null`), with available domain
counts retained. Authorization failure denies the report, and a failed or
incomplete domain query never becomes an apparently complete zero report.

The metrics are viewed by enabled internal operators at `/internal/activity`
(see `docs/23_HTTP_AND_ROUTE_SURFACES.md`). The page shows an empty denominator
as `N/A`, never `0`, and shows an unavailable Feedback section as "Unavailable".
Its header states the Manila period, the generation time, and the coverage
labels the report returns. It shows no Provider, customer, or record identifiers.

## Provider metrics

### Provider creation and type split

```sql
SELECT provider_type, count(*) AS providers_created
FROM public.providers
GROUP BY provider_type
ORDER BY provider_type;
```

### Repair creation adoption and origin

```sql
SELECT
  p.id AS provider_id,
  p.provider_type,
  count(r.id) AS repairs_created,
  count(r.id) FILTER (WHERE r.origin = 'CUSTOMER_REQUEST') AS request_origin,
  count(r.id) FILTER (WHERE r.origin = 'PROVIDER_CREATED') AS direct_origin
FROM public.providers p
LEFT JOIN public.repairs r ON r.provider_id = p.id
GROUP BY p.id, p.provider_type
ORDER BY repairs_created DESC, p.id;
```

Starting from `providers` keeps zero-Repair Providers in the adoption
denominator. Repairs per Provider is the MVP repeat-use signal; registration
count alone is not adoption.

### Status maintenance

```sql
SELECT
  count(DISTINCT repair_id)
    FILTER (WHERE from_status IS NOT NULL) AS repairs_with_status_changes,
  count(DISTINCT repair_id)
    FILTER (WHERE to_status IN ('WAITING_FOR_PARTS', 'AWAITING_APPROVAL'))
      AS repairs_using_waiting_states,
  count(DISTINCT repair_id)
    FILTER (WHERE to_status = 'READY') AS repairs_ever_ready
FROM public.repair_status_events;
```

The initial `NULL -> IN_PROGRESS` event is creation history and is not counted
as Provider status maintenance.

Current activity age may include both Repair changes and Customer Updates:

```sql
SELECT
  r.id,
  now() - greatest(r.updated_at, coalesce(max(ru.created_at), r.updated_at))
    AS age_since_last_activity
FROM public.repairs r
LEFT JOIN public.repair_updates ru ON ru.repair_id = r.id
WHERE r.current_status <> 'COMPLETED'
GROUP BY r.id, r.updated_at
ORDER BY age_since_last_activity DESC;
```

### Repair Request behavior

```sql
SELECT
  count(*) AS requests_submitted,
  count(*) FILTER (WHERE status = 'ACCEPTED') AS requests_accepted,
  count(*) FILTER (WHERE status = 'DECLINED') AS requests_declined,
  count(*) FILTER (WHERE status = 'ACCEPTED')::numeric
    / NULLIF(count(*), 0) AS acceptance_rate,
  avg(coalesce(accepted_at, declined_at) - submitted_at)
    FILTER (WHERE status IN ('ACCEPTED', 'DECLINED')) AS average_decision_time
FROM public.repair_requests;
```

Unreviewed Requests remain in the denominator for the documented MVP
conversion definition. Report terminal-only conversion separately if the pilot
question changes.

### Completion

```sql
SELECT
  count(*) AS repairs_created,
  count(*) FILTER (WHERE completed_at IS NOT NULL) AS repairs_completed,
  count(*) FILTER (WHERE completed_at IS NOT NULL)::numeric
    / NULLIF(count(*), 0) AS completion_rate
FROM public.repairs;
```

## Customer metrics

### Tracking adoption

```sql
SELECT
  count(*) AS total_successful_tracking_views,
  count(DISTINCT repair_id) AS repairs_with_a_successful_view
FROM public.tracking_events;
```

```sql
SELECT
  count(DISTINCT te.repair_id)::numeric / NULLIF(count(DISTINCT r.id), 0)
    AS tracking_adoption
FROM public.repairs r
LEFT JOIN public.tracking_events te ON te.repair_id = r.id;
```

The denominator is authoritative Repairs issued Tracking credentials. Repeated
refreshes increase total views but not the distinct-Repair adoption count.

### Repeat tracking

```sql
SELECT repair_id, count(*) AS successful_views
FROM public.tracking_events
GROUP BY repair_id
ORDER BY successful_views DESC, repair_id;
```

This is repeat observation per Repair, not unique-Customer measurement. Feature
06 deliberately stores no identity, cookie, network, or fingerprint data.

### Customer communication outcome

During pilot interviews, compare whether Customers still need to call/message
for status after receiving Tracking access. That qualitative outcome is not
inferred from page refresh counts.

## Independent versus Shop comparison

Because both are main target segments, join Provider-owned metrics through
`repairs.provider_id` or `repair_requests.provider_id` and compare:

- Repair creation behavior;
- use of Repair Requests;
- use of Service Modes;
- mobile usage observations gathered during the pilot;
- completion/maintenance behavior.

Do not let a shop-heavy pilot hide poor fit for Independent Repairers.

## Avoid vanity metrics

Do not treat registration count alone as validation.

Stronger evidence:

- real Repairs entered;
- status maintained;
- Customers use Tracking;
- Providers request continued access.
