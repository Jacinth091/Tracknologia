# ADR 0002 — Provider Is Not the Authenticated User

## Status

Accepted.

## Context

A Repair Provider is the business/operational identity. A human user authenticates and acts for that Provider. A Shop may have one owner or multiple users later.

## Decision

Keep `Provider` separate from authenticated `User`, linked through Provider membership.

## Consequences

- one-person Shop is represented naturally with one OWNER membership;
- future multi-user shops do not require remodeling Provider identity;
- authorization can be expressed as user-to-provider membership;
- do not create a separate technician entity for MVP.
