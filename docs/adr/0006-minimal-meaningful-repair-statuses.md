# ADR 0006 — Minimal Meaningful Repair Statuses

## Status

Accepted as current MVP baseline.

## Context

A long sequence such as Received -> Diagnosing -> Repairing -> Testing forces technicians to record activities rather than meaningful operational states.

## Decision

Use:

- `IN_PROGRESS`
- `WAITING_FOR_PARTS`
- `AWAITING_APPROVAL`
- `READY`
- `COMPLETED`

`IN_PROGRESS` covers normal technical work. Waiting states are optional manual branches.

## Consequences

- less technician interaction overhead;
- status communicates operational meaning rather than every activity;
- detailed customer progress can be expressed through separate Customer Updates;
- exact labels remain subject to usability evidence.
