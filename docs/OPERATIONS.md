# Operations & Hotfix

Canonical operational reference for Tracknologia after deployment: what to watch, how to classify incidents, and how to fix and release under pressure. The reviewed handoff specification (`docs/release/v0.1.0-hardening/handoff/08_POST_DEPLOYMENT_STABILIZATION.md`) remains the source of truth; this document is the day-to-day entry point and stays aligned with it. Update this document (only) as real incidents, verified recovery steps, and production thresholds accumulate — do not fork duplicate runbooks.

Deployment is the start of operational validation, not the end of engineering work.

## Post-deployment monitoring

### First hour

Watch:

```text
HTTP 5xx
unexpected 4xx
429 / rate-limit behavior
Supabase / Auth failures
database connections
slow queries
email failures
Tracking failures
request failures
```

Repeat the critical smoke flows manually against production using non-sensitive test data.

### First-day review

Review:

```text
onboarding failures
invite failures
Request submission rates / errors
Repair creation / status errors
Tracking success / errors
rate-limit events
database growth
support / user feedback
```

Log hygiene: logs must never contain raw Tracking credentials or unnecessary customer data.

## Incident severity

### P0

```text
tenant breach
credential exposure
private-data leak
destructive corruption
```

Response: contain the affected seam, preserve evidence, hotfix immediately, add a security regression test, and create an incident record.

### P1

```text
core workflow outage
widespread auth failure
Request/Tracking outage
migration failure
Staff authorization defect
```

Immediate hotfix.

P2/P3 return to the normal backlog unless impact escalates.

## Hotfix flow

```text
hotfix/<issue>
  -> staging
  -> full affected validation
  -> master
  -> deploy
  -> smoke
```

Never patch only `master` while leaving `staging` divergent.

If emergency SQL/config action is performed manually in production, immediately reconcile the exact change into version-controlled migration/configuration and verify staging equivalence.

## Rollback vs forward fix

Roll back only when:

```text
the previous application remains schema-compatible
the failure is application-only
rollback is safer
```

Do a forward fix when:

```text
a migration already changed preserved schema/data
the old application is incompatible
rollback increases inconsistency/risk
```

## Stabilization window

For several days after each release:

```text
pause major feature work
prioritize production defects
watch real load
watch abuse controls
watch DB/query behavior
watch analytics storage
```

Resume the next feature milestone only after no unresolved production P0/P1 remains.

## Exit criteria

```text
[ ] no unresolved production P0/P1
[ ] error rate stable
[ ] DB integrity stable
[ ] abuse controls behave as expected
[ ] core journeys stable
[ ] emergency manual actions reconciled to repository
[ ] operational runbook updated (this document)
[ ] v0.2 backlog reprioritized from production evidence
```
