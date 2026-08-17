# ADR 0001 — Modular Monolith for MVP

## Status

Accepted for MVP.

## Context

Tracknologia has one small team, one core repair domain, and no validated need for independently deployed backend services.

## Decision

Implement Tracknologia as a modular monolith. Business capabilities remain separated behind feature-module interfaces but deploy as one application.

## Consequences

- lower deployment/operational complexity;
- transactions remain local;
- module seams remain available for later extraction;
- no microservice/network boundaries until real operational pressure exists.
