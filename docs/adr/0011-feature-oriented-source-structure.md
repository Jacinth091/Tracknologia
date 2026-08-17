# ADR 0011 — Feature-Oriented Source Structure

## Status

Accepted.

## Context

Global technical folders such as `services/`, `controllers/`, `repositories/`, and `types/` scatter knowledge for a single capability across the codebase.

## Decision

Organize Tracknologia business code under `src/features/<capability>/`. Treat each feature as an architectural Module with a small public interface.

## Consequences

- `src/app` remains framework/routing focused;
- business knowledge stays local to features;
- selective `index.ts` barrels define feature interfaces;
- avoid giant global barrels and generic dumping-ground folders.
