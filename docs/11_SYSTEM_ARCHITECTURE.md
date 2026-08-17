# 11 — System Architecture

## MVP architecture

Tracknologia uses a **full-stack Next.js modular monolith**.

```text
Browser
  │
  ▼
Next.js App Router
├── React UI
├── Server Components
├── Server Actions
├── Route Handlers where HTTP is actually needed
└── thin framework adapters
       │
       ▼
Tracknologia feature Modules
├── Auth / Provider Access
├── Providers
├── Repair Requests
├── Repairs
├── Tracking
└── Analytics
       │
       ▼
Supabase adapters
├── Auth
└── PostgreSQL
       │
       ▼
PostgreSQL + RLS
```

## Why no separate backend for MVP

A dedicated NestJS/Express application would add a second runtime, HTTP contract, deployment surface, CORS/auth integration, and development process before the MVP has a second validated client.

For the current responsive-web MVP, Next.js provides sufficient server-side execution through Server Components, Server Actions, and Route Handlers.

Business behavior must still remain behind feature-module interfaces rather than being embedded directly in Server Actions.

## Public and authenticated surfaces

### Public

- Provider-specific Repair Request submission
- public Tracking Code lookup

### Authenticated Provider

- dashboard
- Provider profile
- Repair Requests
- direct Repair creation
- Repair lifecycle management

## Transaction-sensitive operations

### Accept Repair Request

Atomically:

1. authorize owning Provider;
2. verify Request remains `SUBMITTED`;
3. validate Provider-verified Repair data;
4. create Repair;
5. generate Ticket Number and Tracking Code;
6. append initial `IN_PROGRESS` Status Event;
7. mark Request `ACCEPTED`;
8. record acceptance actor/timestamp;
9. commit once.

A uniqueness constraint on `repairs.repair_request_id` prevents duplicate Repairs from repeated acceptance attempts.

### Change Repair Status

Atomically:

1. authorize Provider ownership;
2. validate requested transition;
3. update `repairs.current_status`;
4. append `repair_status_events`;
5. set `completed_at` when appropriate;
6. commit.

## Native mobile future

Native mobile remains deferred. If validated later, expose HTTP Route Handlers or introduce a dedicated backend at that time while reusing the same domain rules/contracts.

Do not force every current web interaction through REST merely to anticipate a hypothetical mobile client.
