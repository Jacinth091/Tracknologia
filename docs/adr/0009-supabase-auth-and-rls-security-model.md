# ADR 0009 — Supabase Auth and RLS Security Model

## Status

Accepted for MVP.

## Context

Tracknologia needs secure authentication and strong cross-Provider isolation without building credential/session infrastructure from scratch.

## Decision

Use Supabase Auth for authentication identity/session mechanics, Tracknologia feature logic for Provider authorization, and PostgreSQL RLS for database-level isolation/defense in depth.

## Consequences

- application still performs authorization checks;
- RLS is mandatory on exposed Provider-owned tables;
- privileged Supabase secrets remain server-only;
- Provider membership is authoritative application data rather than a simplistic global role on the Auth user.
