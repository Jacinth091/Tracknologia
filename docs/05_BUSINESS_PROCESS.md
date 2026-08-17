# 05 — Business Process

## Process A — Customer-submitted Repair Request

1. Provider shares or exposes a provider-specific Tracknologia request page.
2. Customer opens the page without signing in.
3. Customer enters contact, device, problem, and preferred Service Mode information.
4. Tracknologia creates a `RepairRequest` with status `SUBMITTED` and a Request Reference.
5. Only the selected Provider's authorized Provider Users can see the Request.
6. Provider reviews the information.
7. Provider either:
   - declines the Request; or
   - chooses **Accept & Create Repair**.
8. Before creating the Repair, Provider verifies/corrects customer-supplied details and may add Provider-only intake fields.
9. Tracknologia creates one authoritative `Repair`.
10. Repair origin is recorded as `CUSTOMER_REQUEST`.
11. Tracknologia generates Ticket Number and Tracking Code.
12. Initial Repair Status becomes `IN_PROGRESS` automatically.
13. Provider maintains the Repair until it is `READY` and then `COMPLETED`.

## Process B — Provider direct creation

1. Customer interacts directly with Provider through walk-in, meetup, home service, drop-off, chat, or another arrangement.
2. Provider User chooses **Create Repair**.
3. Provider enters customer, Device Snapshot, and Reported Problem information.
4. Tracknologia creates the Repair immediately.
5. Repair origin is recorded as `PROVIDER_CREATED`.
6. Ticket Number and Tracking Code are generated.
7. Initial status becomes `IN_PROGRESS` automatically.
8. Provider manages the same Repair lifecycle as any Request-originated Repair.

## Repair lifecycle

Normal path:

```text
IN_PROGRESS → READY → COMPLETED
```

Optional blocked paths:

```text
IN_PROGRESS → WAITING_FOR_PARTS → IN_PROGRESS
IN_PROGRESS → AWAITING_APPROVAL → IN_PROGRESS
```

The waiting states are selected manually by the Provider only when they actually apply.

## Service Mode process

Provider configures supported Service Modes from:

- Drop-off
- Meetup
- Home Service
- Other

A Repair Request may capture the Customer's preferred Service Mode. The Provider may verify/change the arrangement before finalizing the Repair.

Service Mode does not create a separate Repair lifecycle.

## Completion

`READY` means the Provider's repair work is finished and the device is ready for the appropriate return/handover.

`COMPLETED` means the repair engagement and device return/handover are finished.
