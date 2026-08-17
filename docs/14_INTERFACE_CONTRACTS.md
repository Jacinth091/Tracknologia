# 14 — Software Interface Contracts

These contracts describe feature-Module interfaces, invariants, and expected failure behavior. Next.js pages/actions adapt framework input to these interfaces.

## Auth — requireProviderContext

```text
requireProviderContext() -> ProviderContext
```

Returns the authenticated user's current Provider context, including at minimum `userId`, `providerId`, and membership role.

Failure: unauthenticated or no valid Provider membership.

## Repair Requests — submitRepairRequest

```text
submitRepairRequest(providerSlug, input) -> RepairRequestReceipt
```

Guarantees:

- target Provider exists and accepts Requests;
- input validates server-side;
- selected preferred Service Mode is valid or intentionally represented as `OTHER`;
- Request is `SUBMITTED`;
- returned Request Reference is safe to show publicly;
- no Repair is created.

## Repair Requests — acceptRepairRequest

```text
acceptRepairRequest(context, requestId, verifiedInput)
  -> AcceptedRepairResult
```

Guarantees:

- caller acts for owning Provider;
- Request is still `SUBMITTED`;
- Provider-verified values become authoritative Repair values;
- exactly one Repair is created;
- Repair origin is `CUSTOMER_REQUEST`;
- Request becomes `ACCEPTED`;
- Repair starts `IN_PROGRESS`;
- initial Status Event exists;
- Ticket Number and Tracking Code are generated.

A second acceptance attempt must not create another Repair.

## Repair Requests — declineRepairRequest

```text
declineRepairRequest(context, requestId) -> RepairRequest
```

Guarantees:

- caller owns Request through Provider context;
- only a `SUBMITTED` Request can be declined;
- no Repair is created.

## Repairs — createRepair

```text
createRepair(context, input) -> RepairResult
```

Guarantees:

- Provider ownership is derived from trusted context, not client-supplied provider id;
- input validates;
- origin is `PROVIDER_CREATED`;
- status begins `IN_PROGRESS`;
- Ticket Number and Tracking Code are unique under chosen scopes;
- initial Status Event is appended.

## Repairs — changeRepairStatus

```text
changeRepairStatus(context, repairId, { nextStatus }) -> RepairDetail
```

Guarantees:

- Repair belongs to Provider context;
- transition is allowed;
- `current_status` and Status Event are committed atomically;
- completion timestamp is maintained consistently.

`WAITING_FOR_PARTS` and `AWAITING_APPROVAL` are optional states, never mandatory stages.

## Repairs — addCustomerUpdate

```text
addCustomerUpdate(context, repairId, message) -> CustomerUpdate
```

Guarantees:

- Provider owns Repair;
- message validates;
- update is customer-visible;
- Repair status does not need to change.

This interface must not accept/republish Internal Notes accidentally.

## Tracking — lookupRepairByTrackingCode

```text
lookupRepairByTrackingCode(code) -> PublicRepairView | NotFound
```

`PublicRepairView` may include:

- Provider display name;
- safe device summary;
- current Repair Status;
- customer-safe updates;
- last-updated timestamp;
- selected Service Mode where useful.

It must not contain:

- customer phone/email;
- Internal Notes;
- raw internal ids;
- Provider-private fields;
- unrestricted Diagnosis/private technical notes.

Unknown/invalid codes reveal minimal information and are subject to rate limits.
