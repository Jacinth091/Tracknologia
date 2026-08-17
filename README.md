# Tracknologia Technical Documentation v0.3

**Project:** Tracknologia  
**Subject context:** FreLean MVP project  
**Status:** Current working technical baseline  
**Revision focus:** MVP implementation architecture, security, database depth, repository structure, and reproducible development environment.

## Current system direction

Tracknologia is a lightweight repair-management and customer-tracking platform for **Repair Shops** and **Independent Repairers**. Both are equal first-class **Repair Providers**.

A Repair can begin through either:

1. a **Customer Repair Request** submitted to one specific Provider; or
2. **direct Provider creation** for a walk-in, meetup, home-service, drop-off, or verbally described job.

Once a Repair exists, both paths use the same lifecycle and accountless customer-tracking flow.

## v0.3 implementation baseline

The current MVP software direction is:

- Next.js App Router + React + TypeScript
- Tailwind CSS + selectively added shadcn/ui components
- Zod for server-side/runtime input validation
- Supabase Auth for authentication
- Supabase-hosted PostgreSQL for persistence
- PostgreSQL Row Level Security as database-level tenant isolation
- responsive web first; native mobile deferred
- Docker + Docker Compose for a reproducible cross-platform development environment
- Vitest/React Testing Library for module/component tests
- Playwright for critical end-to-end flows
- feature-oriented source structure (`src/features`) rather than global `services/`, `controllers/`, or `repositories/` folders

The MVP deliberately does **not** require Express, NestJS, Axios, React Router, Prisma, Redux, Zustand, or React Native.

## Package map

### Canonical domain context

- [`CONTEXT.md`](CONTEXT.md)

### Product and process

- [`docs/01_PRODUCT_CONTEXT.md`](docs/01_PRODUCT_CONTEXT.md)
- [`docs/02_PROBLEM_AND_HYPOTHESES.md`](docs/02_PROBLEM_AND_HYPOTHESES.md)
- [`docs/03_MVP_SCOPE.md`](docs/03_MVP_SCOPE.md)
- [`docs/04_USER_ROLES_AND_PROVIDER_TYPES.md`](docs/04_USER_ROLES_AND_PROVIDER_TYPES.md)
- [`docs/05_BUSINESS_PROCESS.md`](docs/05_BUSINESS_PROCESS.md)
- [`docs/06_USER_SYSTEM_FLOWS.md`](docs/06_USER_SYSTEM_FLOWS.md)
- [`docs/07_USE_CASES.md`](docs/07_USE_CASES.md)
- [`docs/08_DOMAIN_MODEL.md`](docs/08_DOMAIN_MODEL.md)
- [`docs/09_STATE_MODELS.md`](docs/09_STATE_MODELS.md)

### Software design

- [`docs/10_MODULES.md`](docs/10_MODULES.md)
- [`docs/11_SYSTEM_ARCHITECTURE.md`](docs/11_SYSTEM_ARCHITECTURE.md)
- [`docs/12_TECHNOLOGY_STACK.md`](docs/12_TECHNOLOGY_STACK.md)
- [`docs/13_DATA_MODEL.md`](docs/13_DATA_MODEL.md)
- [`docs/14_INTERFACE_CONTRACTS.md`](docs/14_INTERFACE_CONTRACTS.md)
- [`docs/15_SECURITY_AND_PRIVACY.md`](docs/15_SECURITY_AND_PRIVACY.md)
- [`docs/16_VALIDATION_AND_ANALYTICS.md`](docs/16_VALIDATION_AND_ANALYTICS.md)
- [`docs/17_TESTING_STRATEGY.md`](docs/17_TESTING_STRATEGY.md)
- [`docs/18_UI_INFORMATION_ARCHITECTURE.md`](docs/18_UI_INFORMATION_ARCHITECTURE.md)
- [`docs/19_IMPLEMENTATION_PLAN.md`](docs/19_IMPLEMENTATION_PLAN.md)
- [`docs/20_DECISIONS_AND_OPEN_QUESTIONS.md`](docs/20_DECISIONS_AND_OPEN_QUESTIONS.md)
- [`docs/21_CHANGELOG_FROM_V0_1.md`](docs/21_CHANGELOG_FROM_V0_1.md)
- [`docs/22_REPOSITORY_STRUCTURE.md`](docs/22_REPOSITORY_STRUCTURE.md)
- [`docs/23_HTTP_AND_ROUTE_SURFACES.md`](docs/23_HTTP_AND_ROUTE_SURFACES.md)
- [`docs/24_DEPENDENCIES_AND_PACKAGES.md`](docs/24_DEPENDENCIES_AND_PACKAGES.md)
- [`docs/25_DOCKER_DEVELOPMENT.md`](docs/25_DOCKER_DEVELOPMENT.md)
- [`docs/26_DATABASE_SCHEMA_DRAFT.md`](docs/26_DATABASE_SCHEMA_DRAFT.md)
- [`docs/27_CHANGELOG_FROM_V0_2.md`](docs/27_CHANGELOG_FROM_V0_2.md)

### ADRs

- [`docs/adr/0001-modular-monolith-for-mvp.md`](docs/adr/0001-modular-monolith-for-mvp.md)
- [`docs/adr/0002-provider-is-not-user.md`](docs/adr/0002-provider-is-not-user.md)
- [`docs/adr/0003-dual-repair-intake-paths.md`](docs/adr/0003-dual-repair-intake-paths.md)
- [`docs/adr/0004-accountless-public-tracking.md`](docs/adr/0004-accountless-public-tracking.md)
- [`docs/adr/0005-provider-centric-shop-and-independent-model.md`](docs/adr/0005-provider-centric-shop-and-independent-model.md)
- [`docs/adr/0006-minimal-meaningful-repair-statuses.md`](docs/adr/0006-minimal-meaningful-repair-statuses.md)
- [`docs/adr/0007-separate-ticket-and-tracking-identifiers.md`](docs/adr/0007-separate-ticket-and-tracking-identifiers.md)
- [`docs/adr/0008-nextjs-full-stack-mvp.md`](docs/adr/0008-nextjs-full-stack-mvp.md)
- [`docs/adr/0009-supabase-auth-and-rls-security-model.md`](docs/adr/0009-supabase-auth-and-rls-security-model.md)
- [`docs/adr/0010-docker-development-baseline.md`](docs/adr/0010-docker-development-baseline.md)
- [`docs/adr/0011-feature-oriented-source-structure.md`](docs/adr/0011-feature-oriented-source-structure.md)
- [`docs/adr/0012-lean-relational-mvp-schema.md`](docs/adr/0012-lean-relational-mvp-schema.md)

### Development templates

- [`templates/Dockerfile`](templates/Dockerfile)
- [`templates/compose.yaml`](templates/compose.yaml)
- [`templates/.dockerignore`](templates/.dockerignore)
- [`templates/.env.example`](templates/.env.example)

## Explicitly deferred

- Google Maps / Google Places
- general nearby-provider marketplace
- non-Tracknologia provider discovery
- global Repair Request pool or provider bidding
- ratings/reviews
- full POS/accounting/payroll
- full inventory/parts management
- AI diagnosis
- native Android/iOS application
- dedicated NestJS/Express backend
- advanced analytics infrastructure
