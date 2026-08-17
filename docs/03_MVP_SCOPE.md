# 03 — MVP Scope

## Build for MVP

### Provider foundation

- Provider User authentication
- Repair Provider profile
- Provider type: `SHOP` or `INDEPENDENT`
- Service Area
- Supported Service Modes: `DROP_OFF`, `MEETUP`, `HOME_SERVICE`, `OTHER`

### Repair Requests

- provider-specific customer Repair Request page
- customer name/contact
- structured device type
- optional brand/model/identifier/specification details
- Reported Problem
- preferred Service Mode
- Request Reference generation
- Provider Request inbox
- review Request
- accept + verify Request
- decline Request

### Direct Repair creation

- Provider creates Repair without needing a Repair Request
- customer information
- Device Snapshot
- Reported Problem
- physical condition/accessories where used
- initial observation

### Repair lifecycle

- automatic initial `IN_PROGRESS`
- manual `WAITING_FOR_PARTS`
- manual `AWAITING_APPROVAL`
- manual return to `IN_PROGRESS`
- manual `READY`
- manual `COMPLETED`
- Status Event history
- Diagnosis
- Internal Notes
- Customer Update

### Tracking

- Ticket Number
- non-trivial Tracking Code
- public tracking lookup
- customer-safe Repair projection
- no Customer account

### Provider dashboard

- Repair Requests
- Active Repairs
- Waiting Repairs
- Ready Repairs
- Completed Repairs
- direct Create Repair action
- search basic Repairs

### Validation instrumentation

- Repair created
- Repair origin (`CUSTOMER_REQUEST` or `PROVIDER_CREATED`)
- status changed
- tracking viewed
- Repair completed

## Conditional / validate during implementation

- exact requiredness of Brand and Model
- Serial Number / IMEI requirements by Device Type
- physical-condition capture
- accessories-received capture
- customer secondary verification for public tracking
- cancellation/unable-to-repair states
- custom Service Mode text behavior

## Deferred

- Google Maps / Maps UI
- Google Places / non-Tracknologia provider discovery
- global Repair Request pool
- bidding / claiming / lead marketplace
- ratings/reviews
- promoted provider listings
- SMS/email automation
- QR features beyond simple link convenience
- custom repair statuses
- advanced staff management
- branch management
- estimates/invoicing/payments
- full inventory
- POS/accounting/payroll
- AI diagnosis
- native mobile apps
- advanced analytics dashboards

## MVP stop rule

After the complete loop below works with real users, stop feature expansion and run the pilot:

```text
Repair Request OR Provider Direct Create
             ↓
           Repair
             ↓
       IN_PROGRESS
             ↓
     optional waiting state
             ↓
           READY
             ↓
        COMPLETED
             ↓
      Customer Tracking
```
