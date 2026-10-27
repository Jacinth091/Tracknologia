# Evidence — Release Candidate, Deployment, Migration, and Recovery (Plan 12)

**Requirement:** immutable RC candidate proven in production-like rehearsals and deployed exactly once per tag, with recovery understanding recorded.
**Repository doc:** [Plan 12](../plans/12_RELEASE_CANDIDATE_DEPLOYMENT_MIGRATION_AND_RECOVERY_PLAN.md), [handoff](../handoff/07_RELEASE_CANDIDATE_AND_DEPLOYMENT.md).
**Related:** operational runbook [docs/OPERATIONS.md](../../../OPERATIONS.md) carries the hotfix flow and the rollback vs forward-fix criteria — this file does not duplicate them.

## Candidate record

| Item                               | Value                                                          |
| ---------------------------------- | -------------------------------------------------------------- |
| Release vehicle                    | v0.1.0 hardening                                               |
| Candidate tag                      | _TBD (immutable)-_ — `v0.1.0-rc.N`; never move an existing tag |
| Candidate commit / SHA             | _TBD_                                                          |
| Second green cycle SHA (unchanged) | _TBD_                                                          |
| Promoted/deployed SHA              | _TBD (must equal candidate SHA)_                               |
| Production tag                     | _TBD — `v0.1.0` identifies the deployed commit_                |
| Deployed URL                       | _TBD_                                                          |

## RC entry requirements

Verified at the candidate gate, not in advance:

```text
[ ] all P0 closed
[ ] all P1 closed
[ ] public abuse controls active
[ ] Staff offboarding complete
[ ] core E2E green
[ ] Database Integration required and green
[ ] Docker Build green
[ ] production config validation green
[ ] trusted-ingress/public-abuse configuration verified in rehearsal
[ ] UAT core flows accepted
```

## Full candidate suite (two consecutive green cycles, unchanged SHA)

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm db:reset
pnpm test:db
pnpm build
docker build .
pnpm test:e2e
```

Each cycle records: date, SHA, and result (paste the workflow run links). A
failed item invalidates the cycle; the reset cycles require the same SHA twice.

```text
Cycle 1 : TBD
Cycle 2 : TBD
```

## Deployment rehearsal 1 — fresh environment

```text
[ ] date / SHA / executor: TBD
[ ] empty environment applied all migrations cleanly
[ ] production build deployed with production-like env
[ ] core smoke workflows passed (request, repair lifecycle, tracking, staff invite)
```

## Deployment rehearsal 2 — upgrade environment

Run `pnpm rehearse:migrations` (scratch Supabase lab on offset ports; applies
the base history, then only pending migrations, then the integration suite;
fails closed on edited shared migrations):

```bash
pnpm rehearse:migrations --base <published-base-ref>
```

```text
[ ] date / SHA / executor: TBD
[ ] base + pending-only upgrade applied successfully
[ ] existing rows readable/writable, RLS valid, grants valid (integration suite green)
[ ] no shared migration was edited (script enforces permanently)
```

## Production configuration verification

```text
[ ] NEXT_PUBLIC_SUPABASE_URL / keys (publishable in browser, secret server-only): TBD
[ ] NEXT_PUBLIC_APP_URL: explicit public HTTPS origin: TBD
[ ] RESEND_API_KEY / RESEND_FROM_EMAIL: production values, not placeholders: TBD
[ ] NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION: true: TBD
[ ] PUBLIC_ABUSE_SHARED_DEV_BUCKET=false; trusted-proxy secret configured if a proxy fronts the app: TBD
[ ] no test-only toggles active: TBD
```

Email/invite smoke, password-reset smoke, public Request smoke, and Tracking
smoke results (produce evidence attachments at run time):

```text
[ ] invite email + acceptance: TBD
[ ] password reset: TBD
[ ] public Request submission + receipt: TBD
[ ] Tracking lookup + neutral unknown-code behavior: TBD
```

## Backup and recovery

```text
[ ] backup/snapshot available before deployment: TBD (type, location, timestamp)
[ ] responsible owner assigned: TBD
[ ] restore procedure rehearsed/understood: TBD
[ ] forward-fix vs rollback criteria: documented in docs/OPERATIONS.md ("Rollback vs forward fix")
[ ] emergency manual action reconciliation path: documented in docs/OPERATIONS.md ("Hotfix flow")
```

## Hard freeze record

After RC1 the freeze rules from Plan 12 apply (P0/P1-fix-only; lead-approved
low-risk corrections; everything else rejected). Record:

```text
Freeze active from: TBD (with the RC1 tag approval by the release owner)
```
