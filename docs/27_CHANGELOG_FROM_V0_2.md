# 27 — Changelog from v0.2 to v0.3

## Product/domain clarifications

- Clarified that a `SHOP` Provider may have only one person.
- The owner may also be the only working technician.
- No separate technician entity/table is required for MVP.
- Preserved equal first-class treatment of Shops and Independent Repairers.

## Database refinement

v0.2's conceptual database was revised to be more useful without becoming more table-heavy.

Current direction:

- seven core application tables;
- richer Provider, Repair Request, and Repair columns;
- `repair_updates` separated from status history;
- no premature `customers`, `devices`, `provider_locations`, `provider_service_areas`, branch, technician-assignment, inventory, or payments tables;
- `repairs.repair_request_id` nullable + unique to enforce at-most-one Repair per Request;
- Provider supported devices may remain profile metadata/array for MVP;
- Service Modes remain a separate relation because they are repeating values.

## Repository structure

Replaced the proposed `src/modules/` layout with a production-oriented feature structure:

```text
src/
├── app/
├── features/
├── components/
└── lib/
```

Architectural modules remain, but their repository location is `src/features/`.

Added selective feature barrels only (`features/<feature>/index.ts`) and rejected giant global barrel files.

## Technology stack

Promoted the MVP stack from "candidate" to current implementation baseline:

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui selectively
- Zod
- Supabase Auth
- Supabase PostgreSQL + RLS
- Vitest / React Testing Library / Playwright

Explicitly not required initially:

- Express
- NestJS
- Axios
- React Router
- Prisma
- Redux/Zustand
- React Native

## Authentication/security refinement

Clarified responsibility split:

- Supabase Auth = identity/session/authentication mechanics;
- Tracknologia Auth Module = Provider membership and authorization;
- PostgreSQL RLS = database-level tenant isolation/defense in depth.

Added:

- `server-only` guidance;
- Zod validation requirements;
- public Tracking/Request rate-limit requirements;
- safe `PublicRepairView` requirement;
- CSP/security-header hardening;
- explicit Server Action authorization requirements;
- current Next.js `proxy.ts` terminology.

## Docker

Docker + Docker Compose are now part of the MVP development baseline to standardize the environment across developers using different host operating systems.

Added:

- pinned Node LTS container;
- named-volume strategy for container-owned `node_modules`;
- `.env.example` policy;
- WSL2 guidance for Windows;
- Docker/Compose templates.

## Architecture

Next.js is now the chosen full-stack application runtime for MVP. A dedicated NestJS/Express backend remains deferred until another client, such as a native mobile app, is actually validated.
