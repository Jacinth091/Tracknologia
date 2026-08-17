# Development Setup

This is the canonical setup guide for Tracknologia developers.

## Supported workflow

Docker is the default development environment so Windows and Linux developers use the same Node/runtime environment.

## Prerequisites

Required:

- Git
- Docker
- Docker Compose plugin

Recommended on Windows:

- WSL2
- Docker Desktop using the WSL2 backend

Node.js on the host is optional once Docker is configured.

### Verify

```bash
git --version
docker --version
docker compose version
```

## Clone

```bash
git clone <REPOSITORY_URL>
cd tracknologia
```

## Environment configuration

```bash
cp .env.example .env.local
```

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Required values:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

`.env.local` must be ignored by Git.

## Start the application

First run:

```bash
docker compose up --build
```

Normal runs:

```bash
docker compose up
```

Application:

```text
http://localhost:3000
```

Stop:

```bash
docker compose down
```

## Dependency commands

Install repository dependencies from the lockfile:

```bash
docker compose run --rm web npm ci
```

Add a runtime dependency:

```bash
docker compose run --rm web npm install <package>
```

Add a development dependency:

```bash
docker compose run --rm web npm install -D <package>
```

Commit both `package.json` and `package-lock.json` when dependencies change.

## Quality commands

```bash
docker compose run --rm web npm run lint
docker compose run --rm web npm test
docker compose run --rm web npx playwright test
docker compose run --rm web npm run build
```

## Rebuild the container

Rebuild after changes to the Dockerfile or when the dependency environment becomes inconsistent:

```bash
docker compose build --no-cache
docker compose up
```

Do not routinely use `--no-cache`; normal Docker caching is desirable.

## Supabase setup

Each development environment needs access to the Tracknologia development Supabase project.

The application uses:

- Supabase Auth;
- PostgreSQL;
- RLS policies;
- `@supabase/supabase-js`;
- `@supabase/ssr`.

Do not place service-role/secret keys in public browser environment variables.

## Native Node fallback

Docker is canonical. If a developer temporarily needs to run the application directly on the host, use the Node major version documented by the repository and run:

```bash
npm ci
npm run dev
```

A problem that occurs only outside the Docker environment is not sufficient evidence that the repository's canonical setup is broken.
