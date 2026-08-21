# Contributing to Tracknologia

## Principles

- Preserve MVP scope.
- Keep Tracknologia terminology consistent with `CONTEXT.md`.
- Prefer feature locality over generic technical-layer folders.
- Keep module interfaces small and implementations deep.
- Do not introduce a dependency, table, workflow or abstraction without a concrete requirement.
- Security and Provider isolation are acceptance criteria, not cleanup work.

## Branches

Use short descriptive branches, for example:

```text
feature/repair-request-form
feature/provider-profile
fix/repair-rls
refactor/repairs-interface
docs/setup-guide
```

## Commits

Keep commits coherent. Avoid combining unrelated formatting, refactors and feature work unless they are necessary for the same change.

## Required checks

Before opening a PR:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
pnpm db:reset
pnpm test:db
```

`pnpm db:reset` and `pnpm test:db` require local Supabase to be running and configured. The database suite runs against real PostgreSQL/Supabase behavior; security-sensitive database changes, including schema, RLS, policies, constraints, triggers, or RPCs, require the real DB suite before completion. See [`docs/17_TESTING_STRATEGY.md`](docs/17_TESTING_STRATEGY.md) for the full testing strategy.

Run Playwright for user-flow changes:

```bash
pnpm exec playwright test
```

## Pull request description

Include:

- what changed;
- why it changed;
- affected Tracknologia feature/domain terms;
- database/security implications;
- tests added or updated;
- screenshots for meaningful UI changes;
- known follow-ups that are intentionally outside the PR.

## Architecture changes

Before introducing a new top-level source folder, database table, framework, ORM, client-state library or separate deployable application, confirm that the current architecture cannot satisfy the requirement cleanly.

Use an ADR only when the decision is hard to reverse, surprising without context, and represents a real trade-off.
