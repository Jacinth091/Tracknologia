# Architecture

Tracknologia is an MVP-oriented modular monolith hosted by Next.js.

## Runtime view

```text
Browser
  |
  v
Next.js
  |
  v
Tracknologia feature modules
  |
  v
Supabase adapter / PostgreSQL
```

Next.js hosts the web UI and server runtime, but Tracknologia's business behavior is concentrated in feature modules rather than pages.

Email goes through SMTP using nodemailer (`src/lib/email/client.ts`, settings in
`src/lib/config/server.ts`). Resend was replaced because the pilot has no domain
to verify with it. Any SMTP provider works through settings alone. Invitation
email is optional, and without SMTP settings invitations are shared with Copy Link.

## Source structure

```text
src/
├── app/
├── features/
│   ├── auth/
│   ├── internal-operations/
│   ├── providers/
│   ├── repair-requests/
│   ├── repairs/
│   ├── tracking/
│   └── analytics/
├── components/
│   ├── ui/
│   └── shared/
└── lib/
    └── supabase/
```

## Feature module principle

Each feature should expose a small interface and hide its implementation.

Example Repairs interface:

```text
createRepair
getRepair
listRepairs
changeRepairStatus
completeRepair
```

Callers should not need to know how ticket codes, status history, validation, persistence or authorization are implemented internally.

## Dependency direction

Allowed:

```text
app -> features -> infrastructure/database
```

Avoid:

```text
features -> app
features -> React pages
features -> route-local UI
```

## Next.js adapters

Server Actions and Route Handlers are adapters at the web seam.

Example:

```text
Create Repair form
      |
      v
Server Action
      |
      v
Repairs feature
      |
      v
PostgreSQL
```

The Server Action should parse/adapt input and establish authenticated context; the Repairs feature owns Repair behavior.

## Public tracking

Public tracking is a distinct feature even though it reads Repair data.

It exposes a restricted `PublicRepairView` rather than the full Repair representation. This gives the interface a security role as well as a design role.

## Analytics / pilot metrics

Analytics derives Provider, Request, Repair, origin, lifecycle, and completion
metrics from authoritative domain tables. The Next.js adapter composes Tracking
and Analytics without coupling the two feature Modules:

```text
Tracking -> PublicRepairView
                  ↓
       /track Server Action
        ├── response to Customer
        └── after() -> Analytics -> Supabase/PostgreSQL
```

The Analytics Interface hides best-effort persistence for minimal successful-
view telemetry. Analytics latency/failure is outside the response path and does
not make Tracking/domain operations unavailable. No dashboard, broad event
platform, or external analytics dependency is part of the MVP architecture.

## Private internal operations

`getValidationMetrics` is the server-only O2 report Interface. It owns period
validation, ratios, fixed projection and honest coverage metadata; a narrow
set-based PostgreSQL RPC performs the aggregate read. It composes Feedback
through that Module's summary Interface in batches within the existing 31-day
query bound. Feedback depends only on the independent Operations access entry,
so reporting does not create a barrel cycle. The pure projection helper stays
internal to the Module. No raw-domain browser or public metrics route is added.

`src/features/internal-operations` is a separate Module for the private
internal-operator privilege layer. It is intentionally independent of Provider
membership: an operator may have no Provider, and owning a Provider grants no
internal access.

Public Interface:

```text
requireInternalOperator() -> ALLOWED | UNAUTHENTICATED | FORBIDDEN | UNAVAILABLE
recordSensitiveInternalAccess(category)
```

The guard derives identity only from `src/features/auth`, reads the private
mapping through the dedicated `src/lib/supabase/internal.ts` service-role
adapter, and returns a typed outcome rather than throwing security decisions.
`recordSensitiveInternalAccess` re-runs the guard and appends the required audit
event through a service-role-only database function; the public Interface never
accepts a caller-supplied operator identity.

`access.ts` is the narrow public entry for this capability, not a pass-through.
The Feedback Module (`src/features/feedback/`) imports the guard/audit entry from
this Module instead of reaching into internal persistence. This keeps the dependency
direction one-way when Operations reporting later depends on Feedback summaries:
Operations -> Feedback summary -> Operations must never become a barrel cycle,
so Feedback-adjacent code receives only the small guard/audit Interface and
never imports an Operations barrel or persistence detail.

The `src/app/(internal)/internal` route group owns only the shell, navigation,
and safe denied/unavailable rendering. Both the layout and each sensitive page
operation call the Module guard, so a layout cannot become the only enforcement
point. Sensitive content renders only after the required audit append succeeds.
The route is dynamic and non-indexable.

A private internal area does not justify a second application shell, Provider
impersonation, or Auth-metadata authorization. Provisioning/revocation remains a
manual, owner-approved service-role operation, not a web action.

## Future native mobile

A native mobile client is deferred. If validated later, stable HTTP Route Handlers or a separate backend can adapt to the same business rules. Do not build a broad REST layer solely for hypothetical future mobile use.
