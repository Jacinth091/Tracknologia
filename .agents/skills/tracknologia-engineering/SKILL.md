---
name: tracknologia-engineering
description: Repo-specific engineering and UI design guidance for Tracknologia. Use when planning, implementing, reviewing, or restructuring Tracknologia code involving Next.js routes, feature boundaries, components, forms, Supabase access, frontend layout, responsive behavior, visual design, design tokens, or documentation updates. Also use when deciding where new code belongs or whether a new abstraction, dependency, route, component, or database-facing pattern fits the repository.
---

# Tracknologia Engineering

Keep Tracknologia cohesive, lean, and deliberate. Prefer the smallest structure that preserves clear ownership, security, testability, and a professional interface.

## Start Every Task

1. Read the repository `AGENTS.md` and obey the generated Next.js rules.
2. Read the relevant existing feature and route before adding code.
3. Read the relevant repo docs when the change affects architecture, database, security, setup, testing, or product behavior.
4. For Next.js behavior, inspect the installed Next.js documentation under `node_modules/next/dist/docs/` before relying on remembered conventions.
5. Preserve established repository patterns unless the task demonstrates a concrete reason to change them.

## Choose the Right Reference

- For repository structure, feature ownership, dependency direction, barrels, server/client separation, and abstractions, read `references/codebase-structure.md`.
- For routes, page composition, forms, shared versus feature-local components, and responsive behavior, read `references/routes-and-components.md`.
- For visual direction, palette, spacing, radius, typography, status colors, dashboard layout, and UI anti-patterns, read `references/visual-system.md`.
- For documentation responsibilities and change completion, read `references/change-discipline.md`.

## Core Engineering Rules

- Organize business capabilities under `src/features/`; treat each feature as a Module with a small public Interface.
- Keep `src/app/` thin: routing, layouts, page composition, Server Actions, Route Handlers, and adaptation only.
- Keep business rules inside the owning feature, not inside pages, components, or generic helpers.
- Prefer feature-local schemas, types, queries, commands, and UI over global dumping grounds.
- Use `index.ts` only as a meaningful feature Interface; avoid global barrel files.
- Prefer Server Components. Add `"use client"` only where browser interactivity requires it.
- Use shadcn/ui and Base UI primitives before inventing foundational UI controls.
- Use Zod for untrusted server-side input validation.
- Treat Supabase Auth as authentication only; Tracknologia still owns authorization and Provider isolation.
- Keep database/persistence code server-only and preserve RLS assumptions.
- Do not introduce Express, NestJS, Axios, React Router, Prisma, Redux, Zustand, or another major dependency without a present requirement and explicit architectural justification.
- Do not add speculative tables, extension points, repositories, managers, factories, or wrapper layers for hypothetical future needs.

## Design Philosophy

Build a calm, modern repair-operations product rather than a generic admin template.

- Professional, approachable, and slightly soft rather than playful or corporate-heavy.
- Rounded but controlled: use the repository's shadcn Base UI + Maia direction and shared radius tokens.
- Favor strong hierarchy, whitespace, borders, and restrained shadows over decorative gradients or glass effects.
- Make device identity, repair state, and next action visually obvious.
- Design for independent repairers using a phone browser as seriously as desktop repair shops.
- Use semantic color intentionally; do not turn every card or status into a different saturated color.
- Keep primary actions singular and easy to find.

## Implementation Discipline

Before adding a new file or abstraction, ask:

1. Which feature owns this knowledge?
2. Can the existing feature Interface absorb it cleanly?
3. Is the abstraction hiding meaningful complexity or only adding indirection?
4. Is the code actually reused by concepts that change for the same reason?
5. Does this create a new dependency or architectural seam that must be documented?

Prefer a little local duplication over the wrong shared abstraction.

## Review Expectations

When reviewing or finishing a change, check:

- feature ownership and dependency direction;
- route and component placement;
- server/client boundaries;
- authorization and Provider isolation;
- Zod validation at untrusted seams;
- public/private data separation;
- responsive behavior at phone, tablet, and desktop widths;
- consistency with design tokens and shadcn primitives;
- high-value behavior tests rather than implementation-mirroring tests;
- documentation updates when behavior or architecture changed.

Do not claim checks passed unless they were actually run.
