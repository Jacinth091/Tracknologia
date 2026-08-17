# ADR 0012 — Lean Relational MVP Schema

## Status

Accepted as current schema direction.

## Context

The first schema draft lacked some practical detail; a subsequent reaction over-normalized Provider location/service concerns into too many tables for the MVP.

## Decision

Keep a small relational core with richer columns for single-valued/snapshot data. Create separate tables only for genuine repeating relationships/history.

Core application tables:

- providers
- provider_memberships
- provider_service_modes
- repair_requests
- repairs
- repair_status_events
- repair_updates

Do not create Customer, Device, location, branch, technician-assignment, inventory, or payment tables until validated.

## Consequences

- richer Repair/Provider records without unnecessary joins;
- Request-to-Repair uniqueness remains database-enforced;
- Customer/Device history can be normalized later if validated;
- Service Mode/history remain normalized because they are truly repeating.
