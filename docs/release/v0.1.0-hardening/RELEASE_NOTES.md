# Release Notes — Tracknologia v0.1.0

Status: release notes for the v0.1.0 hardening release. The exact candidate
commit, RC tags, and production tag are recorded in
[evidence/12-RC-DEPLOYMENT-REHEARSAL.md](evidence/12-RC-DEPLOYMENT-REHEARSAL.md)
when the candidate protocol (Plan 12) completes; this file records what the
release delivers and its known limitations.

## Highlights

v0.1.0 delivers the complete MVP loop with the hardening work required to run
it safely with real users.

### Complete repair workflow

- Public Repair Requests: customers submit a structured request (device,
  problem, preferred Service Mode) to a Provider's request page and receive a
  Request Reference — no account required.
- Provider review: accept a Request into a Repair or decline it; concurrent
  accept/decline attempts serialize to one durable outcome.
- Direct Repair creation: Providers can create Repairs without a Request.
- Repair lifecycle: automatic `IN_PROGRESS` start; optional
  `WAITING_FOR_PARTS` and `AWAITING_APPROVAL` states; `READY` → `COMPLETED`
  terminal completion. Every change is recorded as an append-only status event.
- Customer Updates: Providers add progress updates to a Repair.

### Customer tracking without a shop account

- Non-trivial Tracking Code per Repair (`TRK-…`), public lookup through a
  narrow allow-listed projection — never the raw Repair record.
- Status, latest Customer Update, and the reported problem context are
  customer-visible; internal notes and Provider data are not.

### Provider onboarding for both Provider types

- `SHOP` and `INDEPENDENT` Provider onboarding with supported Service Modes
  (`DROP_OFF`, `MEETUP`, `HOME_SERVICE`, `OTHER`), Service Area, and public
  Provider profile page.
- Staff onboarding strictly via single-use, expiring, revocable invitations
  bound to the invited email; owner-removal of Staff cuts both application
  authorization and RLS access.

### Security posture

- Authorization is enforced at the application seam (`requireProviderContext()`
  style) owning membership derivation, and again by PostgreSQL RLS as defense
  in depth: Provider A cannot read or mutate Provider B data by forged
  identifiers.
- Durable per-actor rate limiting on public operations (request submission,
  tracking lookup) survives server restarts — abuse controls are not
  in-memory.
- No privileged credentials in the browser; service-role access is server-only.

### Validation readiness

- CI gates: format, lint, typecheck, unit suite, real-PostgreSQL integration
  suite (RLS/isolation invariants), Playwright E2E for core flows, and a
  migration-rehearsal gate (`pnpm rehearse:migrations`).
- Recorded pilot-load baselines: repeatable load harness
  (`scripts/load/`) with all pilot targets achieved (see
  [evidence/10-LOAD-RESILIENCE-BASELINES.md](evidence/10-LOAD-RESILIENCE-BASELINES.md)).
- UAT delivery toolkit: repeatable test data pack (`scripts/uat/`) and the
  pilot evidence scaffold.

## Known limitations (explicitly not in this release)

Scope follows the MVP (docs/03_MVP_SCOPE.md). The following are deliberate
exclusions, not defects:

- No ratings, reviews, listings, bidding or provider marketplace; the Request
  pool is per-Provider only.
- No messaging, attachments, photos, or chat; Repairs text-only.
- No payments, invoicing, or accounting.
- No inventory, parts catalogs, technician assignment, or multi-branch shops.
- No SMS or email automation beyond invitations; password reset and other
  lifecycle emails rely on the configured Resend integration.
- No maps UI or places search (Service Area is free text).
- No custom repair statuses, no advanced analytics dashboards, no native
  mobile apps.

Operational limitations while running as a pilot:

- There is no cross-provider operator model: authorization is always scoped to
  one Provider membership.
- A Supplier-domain email mismatch on a staff invitation surfaces an explicit
  error detail to the inviter; there is no auto-retry of delivery.
- Rate limiting is per durable actor bucket; shared carrier IPs without a
  configured trusted-proxy secret share one anonymity bucket
  (`PUBLIC_ABUSE_SHARED_DEV_BUCKET` is a development-only toggle and is
  rejected in production).
