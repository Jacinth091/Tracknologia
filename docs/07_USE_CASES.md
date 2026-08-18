# 07 — Use Cases

## Customer use cases

### UC-C01 — Submit Repair Request

**Actor:** Customer  
**Precondition:** Customer has opened a Provider-specific request page.  
**Main flow:**

1. Customer enters contact information.
2. Customer selects Device Type.
3. Customer optionally enters Brand, Model, identifier, and technical details.
4. Customer describes Reported Problem.
5. Customer selects a supported preferred Service Mode.
6. Customer reviews and submits.
7. System creates `RepairRequest(SUBMITTED)` and returns Request Reference.

**Postcondition:** One Provider receives the Request; no Repair exists yet.

### UC-C02 — Track Repair

**Actor:** Customer  
**Precondition:** An accepted Repair with a valid Tracking Code exists.  
**Main flow:**

1. Customer enters Tracking Code.
2. System validates lookup.
3. System returns customer-safe Repair view.
4. Customer sees status, Provider, device description, Customer Update, and last-updated time.

**Postcondition:** Tracking-view event may be recorded for validation analytics.

## Provider User use cases

### UC-P01 — Configure Provider Profile

Configure Provider type, display information, Service Area, and supported Service Modes.

### UC-P02 — View Repair Requests

List Requests belonging to the current Provider only.

### UC-P03 — Review Repair Request

View Customer, device, Reported Problem, preferred Service Mode, and submitted details.

### UC-P04 — Accept Repair Request

1. Provider opens a `SUBMITTED` Request.
2. Provider chooses Accept & Create Repair.
3. Provider verifies/corrects request data.
4. Provider adds technical intake data.
5. System atomically creates at most one Repair from the Request.
6. Request becomes `ACCEPTED`.
7. Repair receives `IN_PROGRESS`, Ticket Number, and Tracking Code.

### UC-P05 — Decline Repair Request

Provider marks the Request `DECLINED`; no Repair is created.

### UC-P06 — Directly Create Repair

Provider creates a Repair without a Repair Request.

### UC-P07 — View Repair Dashboard

Provider sees current Provider-owned Repairs grouped/filterable by operational state.

### UC-P08 — Update Repair Information

Provider can maintain Diagnosis, Internal Notes, Device Snapshot corrections, and Customer Update according to permissions.

### UC-P09 — Set Waiting for Parts

Provider manually marks an active Repair `WAITING_FOR_PARTS` when work cannot proceed until a required part/material is available.

### UC-P10 — Set Awaiting Approval

Provider manually marks an active Repair `AWAITING_APPROVAL` when customer approval is required before work can continue.

### UC-P11 — Resume Repair

Provider returns a waiting Repair to `IN_PROGRESS`.

### UC-P12 — Mark Repair Ready

Provider marks `READY` when repair work is finished and the device is ready for return/handover.

### UC-P13 — Complete Repair

Provider marks `COMPLETED` after the repair engagement and handover are finished.

### UC-P14 — Search Repairs

Search Provider-owned Repairs by basic reference/customer/device information.

### UC-P15 — View Completed Repairs

Review basic historical Repair records owned by the Provider.

## System responsibilities

These are system behaviors rather than human-initiated business use cases:

- generate Request Reference;
- generate Ticket Number;
- generate Tracking Code;
- enforce Provider ownership;
- create initial `IN_PROGRESS` Status Event;
- record subsequent Status Events;
- return only public-safe tracking fields;
- prevent one Repair Request from creating multiple Repairs.
