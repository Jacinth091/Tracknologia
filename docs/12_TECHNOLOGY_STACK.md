# 12 — Technology Stack

## Status

This is the current Tracknologia MVP implementation baseline.

## Application

- **Next.js App Router** — full-stack web framework
- **React** — UI model, supplied through Next.js
- **TypeScript** — application language
- **Tailwind CSS** — styling
- **shadcn/ui** — selective UI acceleration, not a required all-components framework

The MVP does not add React Router because App Router owns routing.

## Server-side application behavior

Use Next.js server capabilities:

- Server Components for server-rendered reads;
- Server Actions for form/mutation adapters where appropriate;
- Route Handlers when an HTTP interface is actually needed.

Business rules live in Tracknologia feature Modules, not in page files or giant Server Actions.

## Validation

**Zod** for runtime/server input validation.

Validate every public form, Server Action input, URL/query parameter used for sensitive operations, and Route Handler body before domain behavior.

## Authentication and persistence

### Supabase Auth

Supabase handles authentication mechanics:

- signup/login;
- password handling;
- sessions;
- token issuance/refresh;
- password reset and related identity flows.

Tracknologia still owns authorization through Provider membership and business rules.

### PostgreSQL via Supabase

PostgreSQL is the authoritative relational store.

Use Row Level Security for defense-in-depth tenant isolation in addition to server-side feature authorization.

### Supabase packages

- `@supabase/supabase-js`
- `@supabase/ssr`

Use separate browser/server Supabase clients. Current Supabase SSR guidance uses cookie-based sessions with its SSR package.

## Development environment

- **Docker**
- **Docker Compose**
- **Node.js 24 LTS** pinned by the development image
- committed `package-lock.json`

Docker is used to make the Node/Linux runtime consistent across Windows, Linux, and other developer machines.

## Testing

- **Vitest** — feature/module unit tests
- **React Testing Library** — UI behavior where useful
- **Playwright** — critical end-to-end journeys

## Not required for MVP

- Express
- NestJS
- Axios
- React Router
- Prisma initially
- Redux / Zustand
- React Native / Expo
- microservices
- Kubernetes

## Why Prisma remains optional

Prisma could become useful if persistence complexity or migration ergonomics justify it. The current schema is small enough to use Supabase/PostgreSQL directly behind server-only persistence code. Do not add an ORM solely because it is conventional.

## Mobile strategy

The MVP is a responsive web application. Independent Repairers should be able to use the Provider UI effectively from a phone browser.

If native mobile becomes validated later, it can call a stable HTTP surface implemented with Next.js Route Handlers or a future dedicated backend.
