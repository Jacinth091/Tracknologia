# 21 — Changelog from Previous Technical Package

## Major product corrections

### 1. Provider-centric language

Changed shared framing from repair-shop-centric terminology to generic **Repair Provider** terminology.

Repair Shop and Independent Repairer are now explicitly equal first-class Provider types.

### 2. Independent Repairer operating model

Added:

- Service Area
- Service Modes
- no mandatory public home address

Baseline Service Modes:

- Drop-off
- Meetup
- Home Service
- Other

### 3. Repair Request introduced

Added a pre-acceptance Customer Repair Request concept.

A Request:

- belongs to one Provider;
- is not an accepted Repair;
- can be accepted or declined;
- can create at most one Repair.

### 4. Direct Provider Repair creation preserved

Providers can always bypass Repair Requests and create a Repair directly.

### 5. Device intake expanded

Expanded beyond basic Brand/Model to a structured Device Snapshot concept with candidate fields such as:

- type
- brand
- model
- Serial/IMEI
- specifications
- physical condition
- accessories

Customer technical depth remains optional.

### 6. Status workflow simplified

Removed mandatory activity-like stages such as:

- Received
- Diagnosing
- Repairing
- Testing

Replaced with meaningful operational states:

- IN_PROGRESS
- WAITING_FOR_PARTS
- AWAITING_APPROVAL
- READY
- COMPLETED

Waiting states are optional branches.

### 7. READY made provider-neutral

Changed from shop-biased `READY_FOR_PICKUP` toward `READY`, allowing customer-facing wording to adapt to Drop-off, Meetup, or Home Service.

### 8. Google Maps and general discovery deferred

Location/maps-based discovery of external/non-Tracknologia Providers remains outside the MVP.

Provider-specific request links remain the simplest customer-entry path.

### 9. Status Event history strengthened

Minimal Status Event history remains core because Tracknologia needs to measure Provider update behavior and preserve lifecycle history.
