# 26 — Initial Database Schema Draft

This is an implementation-oriented first migration sketch, not a final production SQL file.

## Enum concepts

```text
provider_type: SHOP | INDEPENDENT
membership_role: OWNER | STAFF
service_mode: DROP_OFF | MEETUP | HOME_SERVICE | OTHER
repair_request_status: SUBMITTED | ACCEPTED | DECLINED
repair_origin: CUSTOMER_REQUEST | PROVIDER_CREATED
repair_status: IN_PROGRESS | WAITING_FOR_PARTS | AWAITING_APPROVAL | READY | COMPLETED
```

## Table inventory

```text
Supabase managed:
  auth.users

Tracknologia core:
  providers
  provider_memberships
  provider_service_modes
  repair_requests
  repairs
  repair_status_events
  repair_updates

Optional validation telemetry:
  tracking_events
```

## Relationship sketch

```text
auth.users
    │
    └──< provider_memberships >── providers
                                  │
                                  ├──< provider_service_modes
                                  ├──< repair_requests
                                  │       │
                                  │       └── 0..1 accepted source
                                  │                │
                                  └──< repairs <───┘
                                          │
                                          ├──< repair_status_events
                                          └──< repair_updates
```

## Key database invariants

### Provider membership

`UNIQUE(provider_id, user_id)`.

A Shop may have exactly one membership in normal MVP use; that owner can also be the technician performing Repairs.

### Provider Service Modes

`PRIMARY KEY(provider_id, mode)`.

### Repair Request

- belongs to one Provider;
- status begins `SUBMITTED`;
- Request Reference unique.

### Request to Repair

`repairs.repair_request_id` is nullable + unique.

This prevents a single Request from creating two accepted Repairs.

### Repair identity

- Tracking Code globally unique;
- Ticket Number unique within Provider scope;
- `current_status` begins `IN_PROGRESS`.

### History

Every status change appends one `repair_status_events` row in the same transaction as the Repair status update.

Customer Updates are separate repeatable rows and do not require status changes.

## Why arrays/text columns are acceptable here

For MVP, `providers.supported_devices` may be a text array because device-category support is profile metadata without an independent lifecycle.

Likewise, `public_address` and `service_area` remain columns because the current MVP does not manage multiple branches or geospatial routing.

If provider discovery/location becomes validated later, those fields can be normalized/geocoded then.

## No separate technician table

Provider Users are represented through membership. Technician assignment is not an MVP workflow.

One person may be:

```text
Provider type: SHOP
Membership: OWNER
Operational reality: owner is also the technician
```

No duplicate "technician profile" is required.

## No Customer/Device registry yet

Customer and device details are captured on Repair/Request because Tracknologia currently manages repair transactions rather than persistent customer/device accounts.

## RLS direction

Provider-owned tables check current `auth.uid()` membership.

Child rows (`repair_status_events`, `repair_updates`) derive authorization through `repairs.provider_id`.

Public Repair Request insertion and public Tracking lookup must use intentionally limited policies/server interfaces rather than broadly opening tables to anonymous reads.
