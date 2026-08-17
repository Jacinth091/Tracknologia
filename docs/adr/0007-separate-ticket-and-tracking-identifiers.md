# ADR 0007 — Separate Ticket Number and Tracking Code

## Status

Accepted.

## Context

Human-readable sequential references are useful operationally but are poor public credentials because they are enumerable.

## Decision

Accepted Repairs receive both a human-readable Ticket Number and a separate difficult-to-guess Tracking Code.

## Consequences

- Ticket Number can be Provider-scoped and readable;
- Tracking Code can be globally unique and security-oriented;
- public tracking never relies solely on a sequential ticket identifier.
