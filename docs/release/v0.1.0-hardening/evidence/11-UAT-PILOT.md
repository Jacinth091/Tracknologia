# Evidence — UAT, Accessibility, Mobile, and Day-in-the-Life Pilot (Plan 11)

**Requirement:** repeatable realistic test data pack; every MVP persona completes core workflows; findings recorded and classified; release blockers fixed in bounded loops; deferred items captured separately.
**Repository doc:** [Plan 11](../plans/11_UAT_ACCESSIBILITY_MOBILE_AND_PILOT_PLAN.md), [handoff](../handoff/06_UAT_AND_PILOT_VALIDATION.md).

## Test Data Pack

Repeatable UAT data lives in `scripts/uat/`:

```bash
npx supabase start          # local stack (CLI prints the test credentials)
pnpm db:reset               # clean migrations state
node scripts/uat/seed.mjs   # seeds the pack; prints the credential manifest
```

- Requires only the local stack values (`SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_JWT_SECRET`); refuses non-local hosts like the E2E fixtures.
- Seeds, per Plan 11's pack list: a one-person Shop (owner-led, full lifecycle repairs + open Requests), a multi-Staff Shop (repair statuses across `IN_PROGRESS` / `WAITING_FOR_PARTS` / `AWAITING_APPROVAL` / `READY` / `COMPLETED`, staff-created direct Repair, Request-origin Repair, accepted/declined/pending Requests, tracked histories with Customer Updates), an Independent Provider (MEETUP + HOME_SERVICE with `service_area` and no Shop address), a closed-intake Shop, and expired/revoked invitation rows.
- Runs all writes through the same persistence seams the application uses (service-role inserts + owner-JWT RPCs), so seeded state is real (ticket numbers, tracking codes, status events).
- `node scripts/uat/seed.mjs --cleanup scripts/uat/outputs/uat-manifest-<run>.json` removes one run; `pnpm db:reset` is always the sledgehammer.
- Credentials for human testers are printed to the manifest and never committed.

### Invitation acceptance setup

The multi-Staff Shop manifest contains a `newStaffEmail` that is not an existing account or membership. Sign in as that Shop Owner, open Team, create an invitation for this address, and copy the generated link. In a separate browser session, open the link, register using that exact address, and complete the Staff profile. Check the resulting Staff access and record the outcome below. Use the existing expired/revoked rows for negative-state checks; they do not contain joinable links. If a live invalid-link test is needed, create and revoke a fresh invitation through Team and try its copied link.

The newly registered Staff account is created during UAT and is not in the seed manifest. Reset the disposable local stack after the pilot to remove it. Actual human invitation, mobile and accessibility outcomes remain TBD.

## Pilot Result Record

| Persona                       | Runner | Date  | Result | Notes                                                          |
| ----------------------------- | ------ | ----- | ------ | -------------------------------------------------------------- |
| Shop Owner (one-person Shop)  | _TBD_  | _TBD_ | _TBD_  |                                                                |
| Shop Staff (multi-Staff Shop) | _TBD_  | _TBD_ | _TBD_  |                                                                |
| Staff offboarding             | _TBD_  | _TBD_ | _TBD_  |                                                                |
| Independent Repairer          | _TBD_  | _TBD_ | _TBD_  |                                                                |
| Customer Request              | _TBD_  | _TBD_ | _TBD_  |                                                                |
| Customer Tracking             | _TBD_  | _TBD_ | _TBD_  |                                                                |
| Hostile / cross-tenant checks | _TBD_  | _TBD_ | _TBD_  | automated cross-tenant suite: `tests/e2e/cross-tenant.spec.ts` |

Finding record template (one row per finding):

```text
persona / scenario / step / expected / actual / severity (P0-P3)
reproducibility / evidence (screenshot or recording path) / Module owner
release blocker (yes/no)
```

Classification: cannot-complete or unsafe-or-misleading → release fix; confusing-but-workable → P2; nice improvement → P3; new business capability → later scope.

## Accessibility Pass

Core routes checked for keyboard navigation, focus visibility, form labels, error association, button semantics, responsive layout, contrast, and screen-reader-friendly status/error text:

```text
Tracknologia dashboard   : TBD
Repair detail/status     : TBD
Request submission       : TBD
Tracking                 : TBD
Staff management         : TBD
Provider settings        : TBD
```

## Mobile Matrix

Tested on: small phone / large phone / tablet / desktop.

```text
Dashboard navigation & lists : TBD
Forms (onboarding, request)  : TBD
Repair detail + status change: TBD
Staff management             : TBD
Tracking from the public page: TBD
```

## Day-in-the-Life Pilot

Continuous scenario (morning → OWNER reviews dashboard/new Requests; day → Staff works, customers submit/track, Repair states advance; end → READY/COMPLETED, OWNER reviews outstanding work):

```text
Date: TBD   Runners: TBD   Sequencing/state defects found: TBD
```

## Deferred Items

Record each deferred P2/P3/new-capability item with its finding reference, owner, and target backlog — none at this time.
