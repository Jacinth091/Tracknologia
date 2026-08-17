# ADR 0005 — Provider-Centric Shop and Independent Model

## Status

Accepted.

## Context

Tracknologia initially drifted toward physical repair-shop assumptions even though Independent Repairers are a primary customer segment.

## Decision

`Repair Provider` is the shared primary concept. `SHOP` and `INDEPENDENT` are equal Provider types using the same repair-management core.

## Consequences

- shared UI uses Provider-neutral language;
- public address is not mandatory for Independent Providers;
- Service Area and Service Modes support independent operating patterns;
- Shop-specific staff/branch features remain optional future additions.
