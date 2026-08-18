# Development Workflow

## Canonical workflow

Start:

```bash
docker compose up
```

Create a branch:

```bash
git switch -c <type>/<short-description>
```

Examples:

```text
feature/repair-request-form
fix/provider-rls-policy
docs/database-schema
```

Implement the smallest coherent change, run the relevant tests, then commit intentionally.

## Before pushing

Run at minimum:

```bash
docker compose run --rm web npm run lint
docker compose run --rm web npm test
docker compose run --rm web npm run build
```

Run Playwright when the change affects an end-to-end user flow:

```bash
docker compose run --rm web npx playwright test
```

## Source conventions

Tracknologia uses feature-oriented locality:

```text
src/features/
├── auth/
├── providers/
├── repair-requests/
├── repairs/
├── tracking/
└── analytics/
```

Do not introduce global technical buckets such as `services/`, `repositories/`, `models/`, `validators/`, or `types/` unless a concrete design pressure justifies them.

Keep schemas and types near the feature that owns them.

## Barrels

A feature may expose a small `index.ts` as its public interface.

Good:

```ts
import { createRepair, getRepair } from "@/features/repairs";
```

Avoid repository-wide barrels that re-export unrelated features/components.

## Next.js layer

`src/app/` adapts URLs, forms, HTTP requests and rendering to Tracknologia features.

Keep Server Actions and Route Handlers thin. They should not own repair lifecycle logic, Provider authorization rules, tracking-code generation, or database transactions.

## Database access

Keep Supabase/database calls behind feature implementation/persistence code. Do not scatter direct `.from("repairs")` queries through pages and UI components.

## New dependencies

Before adding a package, answer:

1. What concrete Tracknologia requirement does it solve?
2. Can the platform/current dependencies already solve it adequately?
3. Does it create another framework/interface the team must learn?
4. Is the dependency worth maintaining for the MVP?

Current deliberate omissions include Axios, Express, NestJS, React Router, Prisma, Redux and Zustand.
