# 16 — Validation and Analytics

Tracknologia is a FreLean MVP. Instrumentation exists to answer product hypotheses, not to build an analytics suite.

## Provider metrics

### Repair creation adoption

- number of Repairs created
- Repairs per Provider
- origin split:
  - `CUSTOMER_REQUEST`
  - `PROVIDER_CREATED`

### Status maintenance

- percentage of active Repairs receiving meaningful status changes
- average age since last update
- usage of optional waiting states

### Repair Request behavior

- Requests submitted
- Requests accepted
- Requests declined
- acceptance rate
- time from submission to acceptance/decline if useful

### Completion

- percentage reaching READY
- percentage reaching COMPLETED

## Customer metrics

### Tracking adoption

```text
Repairs with >=1 tracking view
÷
Repairs issued tracking credentials
```

### Repeat tracking

Number of tracking views per Repair where privacy-preserving measurement is possible.

### Customer communication outcome

During pilot interviews, compare whether Customers still need to call/message for status after receiving tracking access.

## Independent versus Shop comparison

Because both are main target segments, compare:

- Repair creation behavior
- use of Repair Requests
- use of Service Modes
- mobile usage observations
- completion/maintenance behavior

Do not let a shop-heavy pilot hide poor fit for Independent Repairers.

## Suggested event vocabulary

```text
provider_created
repair_request_submitted
repair_request_accepted
repair_request_declined
repair_created
repair_status_changed
repair_tracking_viewed
repair_completed
```

## Avoid vanity metrics

Do not treat registration count alone as validation.

Stronger evidence:

- real Repairs entered;
- status maintained;
- Customers use tracking;
- Providers request continued access.
