# ADR 0010 — Docker Development Baseline

## Status

Accepted.

## Context

The team develops across different host operating systems, including Linux and Windows. Runtime/version drift risks "works on my machine" failures.

## Decision

Provide a Docker + Docker Compose development environment with a pinned Node LTS image, committed lockfile, and container-owned `node_modules`.

## Consequences

- developers share the same Linux/Node runtime;
- host `node_modules` is not reused in the container;
- `.env.example` documents required variables while secrets remain local;
- Docker adds some local overhead but reduces environment variation.
