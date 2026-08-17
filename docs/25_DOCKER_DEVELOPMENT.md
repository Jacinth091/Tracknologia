# 25 — Docker Development Environment

## Purpose

Tracknologia developers use different host operating systems, including Linux and Windows. Docker is included to keep the Node/Linux execution environment consistent and reduce "works on my machine" failures.

Docker is development infrastructure, not a product feature.

## Baseline

```text
Developer host
    ↓
Docker Compose
    ↓
Tracknologia Next.js container
    ↓
Cloud/managed Supabase development project
```

Do not containerize unrelated infrastructure merely because Docker is present.

## Runtime

Use the current chosen Node LTS line pinned in the Dockerfile. The included template pins Node 24.18.0 LTS for this documentation revision.

Keep `package-lock.json` committed and use `npm ci` for deterministic installs.

## Source and node_modules

Do not reuse host-installed `node_modules` inside the Linux container.

The container should own its `node_modules` so Windows/macOS/Linux-specific dependencies do not contaminate one another.

Recommended development mount pattern:

```text
host source code -> /app source
Docker named volume -> /app/node_modules
```

## Environment variables

Commit `.env.example`, never `.env.local`.

Each developer creates `.env.local` containing development-only Supabase values.

Never place privileged secrets into client-visible `NEXT_PUBLIC_*` variables.

## Typical workflow

```bash
cp .env.example .env.local
# fill development values

docker compose up --build
```

Subsequent runs:

```bash
docker compose up
```

## Windows note

For best Docker filesystem performance, Windows developers should prefer Docker Desktop with WSL2 and keep the repository in the WSL/Linux filesystem where practical.

## CI consistency

The same locked Node/dependency assumptions should be used in CI. Docker need not be the only way to run CI, but CI must execute the same lint/type/test/build gates.

## Production

Production containerization is possible, but the MVP should not over-engineer production orchestration. Managed hosting remains acceptable. Docker's immediate purpose is cross-developer reproducibility.
