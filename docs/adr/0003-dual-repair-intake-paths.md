# ADR 0003 — Dual Repair Intake Paths

## Status

Accepted.

## Context

Some Customers can submit useful device/problem information themselves. Other jobs begin through walk-in, meetup, home service, or verbal intake.

## Decision

Support both:

1. Customer `RepairRequest` -> Provider verifies/accepts -> `Repair`;
2. Provider directly creates `Repair`.

Both converge on the same authoritative Repair lifecycle.

## Consequences

- Repair Request is optional and never required for direct intake;
- a Request belongs to exactly one Provider;
- accepted Request creates at most one Repair;
- Repair stores origin for validation analytics.
