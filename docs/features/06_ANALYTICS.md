# Feature — Analytics / Pilot Metrics

**Code location:** `src/features/analytics/`

## Description

The Analytics / Pilot Metrics feature measures whether Tracknologia's MVP is producing the behaviors needed to validate the product hypothesis.

This feature is intentionally small. It should not become an enterprise analytics platform or a dependency that complicates core Repair operations.

## Primary goal

Collect just enough reliable behavioral data to answer whether Providers actually use Tracknologia for real repairs and whether Customers use accountless tracking.

## Feature goals

Measure events such as:

- Provider registered/created;
- Repair Request submitted;
- Repair Request accepted;
- Repair Request declined;
- Repair created;
- Repair origin (`CUSTOMER_REQUEST` vs `PROVIDER_CREATED`);
- Repair status changed;
- Customer tracking viewed;
- Repair completed.

Support derived questions such as:

- Are Providers entering real Repairs?
- Do Providers return and use the system repeatedly?
- Are Repairs kept current through status changes/updates?
- What percentage of Repairs originate from customer Requests vs direct creation?
- Do Customers actually use Tracking?
- How many Repairs reach completion?
- How long do Requests wait before Provider action?

## Non-goals

The MVP Analytics feature does not require:

- advanced BI dashboards;
- cohort analysis infrastructure;
- machine learning;
- attribution systems;
- detailed technician productivity monitoring;
- surveillance-style user behavior collection;
- a large analytics schema;
- blocking business operations on analytics writes.

## Main users

- Tracknologia product/team during validation;
- potentially project evaluators reviewing pilot evidence.

This is not primarily a Provider-facing feature in the MVP.

## Implementation options

The feature may initially use either:

1. an external analytics event stream; or
2. an optional small `tracking_events`/event table.

Do not create a large analytics data model before validation needs justify it.

## Conceptual Interface

Keep it minimal, for example:

```ts
recordEvent(event): void | Promise<void>
```

or feature-specific helpers only when they add clarity.

Avoid making every domain Module understand analytics persistence details.

## Event design principles

An event should identify:

- event name;
- timestamp;
- safe correlation identifiers when necessary;
- minimal dimensions required for the validation question.

Avoid copying entire Repair/Customer objects into analytics payloads.

## Relationship with other features

### Providers

May emit Provider-created/registered event.

### Repair Requests

May emit submitted/accepted/declined events and timing information.

### Repairs

May emit created/status-changed/completed events and origin.

### Tracking

May emit customer-tracking-viewed event.

### Auth

Analytics does not replace audit/authorization logging and should not receive secrets/session tokens.

## Availability rule

Core business operations should not normally fail only because analytics recording fails.

Preferred mental model:

```text
Durable domain operation succeeds
        ↓
Analytics observation attempted
```

If analytics is implemented transactionally in the same database for validation accuracy, document the trade-off explicitly. Do not accidentally couple availability without deciding to.

## Privacy/data-minimization requirements

- Do not record passwords/tokens/secrets.
- Avoid customer phone/email unless a specific validated metric genuinely requires them.
- Prefer internal correlation ids over personal data.
- Do not expose analytics data to public Tracking.
- Treat analytics as measurement, not a substitute for domain/audit state.

## UI

No dedicated analytics dashboard is required for the MVP.

Pilot results may be inspected through:

- direct queries;
- a simple internal report;
- external analytics tooling.

Only build a productized analytics dashboard if Provider/customer needs validate it.

## Important metric definitions

### Repair creation count

Count successfully created authoritative Repairs, not Repair Requests.

### Request conversion

```text
accepted Requests / submitted Requests
```

Interpret carefully during a small pilot; declines or unreviewed Requests may have operational context.

### Repair origin split

```text
CUSTOMER_REQUEST vs PROVIDER_CREATED
```

Useful for deciding whether the pre-request flow is actually valuable.

### Tracking adoption

At minimum distinguish:

- Repairs that received at least one successful tracking view;
- total successful tracking views.

Do not treat repeated refreshes by one Customer as equivalent to many Customers without appropriate deduplication assumptions.

## Testing expectations

Test where analytics implementation is code-owned:

- correct event emitted for successful domain action;
- event not emitted for rejected/failed action when semantics require success;
- no secret/private fields in payloads;
- analytics failure does not incorrectly report domain failure when configured as best-effort;
- event names/dimensions remain stable enough for pilot queries.

## Definition of done

The feature is healthy when the team can answer the MVP validation questions with minimal trustworthy instrumentation and without analytics complexity distorting the product architecture.
