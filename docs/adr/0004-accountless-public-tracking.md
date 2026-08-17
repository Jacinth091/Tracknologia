# ADR 0004 — Accountless Public Repair Tracking

## Status

Accepted.

## Context

Requiring Customers to register just to view a repair creates friction and weakens the MVP tracking hypothesis.

## Decision

Customers track accepted Repairs using a strong public Tracking Code without a Tracknologia account.

## Consequences

- Tracking Code acts as a public credential and must be difficult to enumerate;
- public tracking returns only a restricted `PublicRepairView`;
- public lookup requires abuse/rate controls;
- Customer accounts are not an MVP dependency.
