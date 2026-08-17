# Database Design

Tracknologia uses PostgreSQL through Supabase.

The MVP intentionally favors a small schema with sufficiently rich rows rather than premature normalization.

## Core application tables

```text
providers
provider_memberships
provider_service_modes
repair_requests
repairs
repair_status_events
repair_updates
```

Authentication identities live in Supabase-managed `auth.users`.

A `tracking_events` table may be added for pilot analytics when required.

## Relationships

```text
auth.users
    |
    v
provider_memberships
    |
    v
providers
   |             |
   v             v
repair_requests  repairs
                    |
          +---------+----------+
          |                    |
          v                    v
repair_status_events     repair_updates
```

## Provider

`providers` represents both shops and independent repairers.

Important columns include:

```text
id
type                 SHOP | INDEPENDENT
display_name
slug
description
profile_image_url
contact_phone
contact_email
public_address         nullable
service_area           nullable
supported_devices      nullable collection/array
accepting_requests
created_at
updated_at
```

A shop can have one authenticated member who is both owner and working technician. Do not create a separate Technician record solely because a Provider is a shop.

## Membership

`provider_memberships` connects `auth.users` to Providers.

Initial roles:

```text
OWNER
STAFF
```

A unique `(provider_id, user_id)` constraint prevents duplicate membership.

## Service modes

A Provider can support multiple:

```text
DROP_OFF
MEETUP
HOME_SERVICE
OTHER
```

This is genuinely repeating Provider data and therefore remains a separate table.

## Repair Request

A `repair_request` is customer-submitted intake awaiting Provider decision. It belongs to exactly one Provider and has one of:

```text
SUBMITTED
ACCEPTED
DECLINED
```

It is not yet an authoritative Repair.

## Repair

`repairs` is the authoritative repair record and contains the customer/device snapshot for the accepted job.

Important groups of columns:

- Provider and origin
- optional source Repair Request
- ticket number and tracking code
- customer contact snapshot
- device snapshot
- physical condition/accessories
- reported problem
- initial observation/diagnosis/internal notes
- selected service mode
- current status
- audit timestamps/user ids

`repair_request_id` is nullable and unique so one Repair Request can create at most one Repair.

## Repair status

```text
IN_PROGRESS
WAITING_FOR_PARTS
AWAITING_APPROVAL
READY
COMPLETED
```

`IN_PROGRESS` is assigned when the Repair is created. The waiting statuses are optional Provider-selected states. `COMPLETED` is normally terminal.

## Status history vs customer update

`repair_status_events` records lifecycle transitions.

`repair_updates` records customer-visible progress messages that do not necessarily change the lifecycle status.

Do not merge these concepts.

## Deliberately deferred tables

Do not add without a validated requirement:

- customers
- devices
- technicians
- branches
- inventory
- parts
- payments
- invoices
- appointments
- ratings/reviews
- provider-location hierarchies

For the MVP, customer and device information are snapshots attached to a Repair/Repair Request.
