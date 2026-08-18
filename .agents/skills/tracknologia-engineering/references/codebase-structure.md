# Codebase Structure

## Canonical Shape

```text
src/
├── app/
│   ├── (public)/
│   ├── (auth)/
│   └── (provider)/
├── features/
│   ├── auth/
│   ├── providers/
│   ├── repair-requests/
│   ├── repairs/
│   ├── tracking/
│   └── analytics/
├── components/
│   ├── ui/
│   └── shared/
└── lib/
    ├── utils.ts
    └── supabase/
```

`src/app` is the Next.js delivery layer. `src/features` owns Tracknologia behavior. `src/components/ui` contains shadcn-generated primitives. `src/components/shared` is only for genuinely cross-feature visual pieces. `src/lib` is infrastructure glue, not a business-logic dumping ground.

## Dependency Direction

```text
app -> features -> persistence/infrastructure -> Supabase/PostgreSQL
```

Never import `src/app` from a feature. Do not make persistence depend on React. Do not place domain invariants in UI code.

## Feature Shape

Grow a feature only as needed. A mature feature may look like:

```text
features/repairs/
├── index.ts
├── commands.ts
├── queries.ts
├── schemas.ts
├── types.ts
├── persistence.ts
└── repairs.test.ts
```

Do not create every file automatically. Small features may use fewer files.

### Public Interface

Use `index.ts` as the feature Interface when it clarifies what callers may use.

```ts
export { createRepair, changeRepairStatus } from "./commands";
export { getRepair, listRepairs } from "./queries";
export type { RepairStatus } from "./types";
```

Cross-feature callers should normally import from `@/features/repairs`, not deep implementation paths.

## Avoid Horizontal Folder Soup

Do not create global buckets such as:

```text
services/
repositories/
controllers/
models/
types/
schemas/
helpers/
constants/
```

unless several unrelated features genuinely share that concern. Keep knowledge local to its owner.

## Deep Module Heuristics

A good Module has a small Interface and hides meaningful behavior. Use the deletion test: if removing an abstraction only removes indirection, it was probably not earning its place.

Do not create a repository Interface simply because architecture tutorials use repositories. One concrete persistence implementation does not justify a hypothetical seam by itself.

## Server-Only Implementation

Database and privileged authorization code must stay server-side. Use `import "server-only"` where accidental client imports would be dangerous.

## New Dependencies

Before adding one, identify the present problem, compare it with platform capabilities, evaluate maintenance/security cost, and update dependency documentation if the stack materially changes.
