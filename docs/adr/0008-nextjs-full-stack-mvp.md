# ADR 0008 — Next.js Full-Stack MVP

## Status

Accepted for MVP.

## Context

The team needs a responsive web MVP quickly. A dedicated NestJS/Express backend would introduce a second runtime, HTTP contract, deployment surface, and auth integration before a second client exists.

## Decision

Use Next.js App Router for both web UI and server-side application adapters. Keep business behavior behind feature Modules.

## Consequences

- no Express/NestJS required for MVP;
- Server Components/Actions/Route Handlers may call feature Modules;
- future mobile can use Route Handlers or motivate a dedicated backend later;
- avoid embedding domain logic directly in Next.js routes/actions.
