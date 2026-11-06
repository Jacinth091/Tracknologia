# v0.2.0 — MVP validation release candidate

Status: pending corrected-candidate audit, immutable RC verification and owner
release decision under [#97](https://github.com/Jacinth091/Tracknologia/issues/97).
Package version 0.2.0 identifies this candidate; it does not record a deployment.

## Release scope

The first promotion to `main` includes the Provider, Repair Request, Repair and
public Tracking MVP, plus participant Feedback and the private internal console.

The [owner scope amendment in #87](https://github.com/Jacinth091/Tracknologia/issues/87)
on 2026-11-07 explicitly includes the implemented additions from #134, #137 and
#139–#141: health probes and safe metric-rejection logging, Health/Diagnostics,
Reports/CSV/JSON exports, and Overview status, release and domain freshness.
This supersedes the earlier deferral of those implemented additions.

Independent uptime-observer ingestion/history, host/DB telemetry integrations
and fixed-category operation counters remain deferred under #115. The UI must
continue to disclose their absence. #116 still requires its remaining browser,
keyboard/mobile and real export acceptance evidence.
The pilot's separately configured UptimeRobot monitor on `/api/health` and its
live verification remain required by #97; deferring in-app observer ingestion
does not remove that operational requirement.

## Export privacy correction

The governed review of [PR #132](https://github.com/Jacinth091/Tracknologia/pull/132)
at `135e66f5c6dd8d3f7964e3257d5a38f941c7b1e3` found REQ-PRIV-01: a visible
period creation total of 6 and current status of 5 exposed a withheld
single-Repair status. Status totals could also expose a withheld Repair-origin
count.

This correction pools the whole Repair section when any Repair count is 1–4,
including the all-time Repair total and its tracking adoption ratio. Request
counts and ratios are likewise pooled when a small Request cohort could be
reconstructed from submitted/decided/pending complements. Existing whole-section
Feedback pooling remains in place. Both serializers consume the same suppressed
report; zero and N/A remain distinct outside pooled sections. The policy remains
minimum group 5 with complementary suppression.

The corrective review of #142 additionally identified Activity daily/repeat
disclosure (REQ-PRIV-02). A hidden repeat count of 1 can be reconstructed from
daily counts 5 and 6 and distinct total 10. Activity is now pooled as a section
when any count is small. Tracking also pools event/distinct-Repair counts to
prevent event totals from recovering a hidden distinct count. Regression tests
exercise the projected report and both serializers, plus no-small cases.

For RISK-EXPORT-03, the owner explicitly chose protection within each individual
export on 2026-11-07 ([#87](https://github.com/Jacinth091/Tracknologia/issues/87)).
Overlapping periods or repeated snapshots can reveal small changes when combined;
this residual risk is accepted. Only reports reviewed together for disclosure by
the owner or a designated internal reviewer may be shared with the approved
internal/developer audience. This is an operational control, not an app-enforced
multi-export privacy guarantee. The Reports page and exported notes disclose it.

## Candidate identity and acceptance

The reviewed candidate was `staging` at `135e66f`, against `main` at `32e21f1`:
699 commits, 520 changed files and 26 forward-only migrations. `main` was already
an ancestor of that staging head; no Update branch operation was required.

The accepted audit at `86fb92b` and RC record at `9df66bd` are historical evidence.
They do not certify the later console/export changes or this correction. The
review of `135e66f` was FAIL / RETURN TO DEV despite its five passing CI checks.

After this correction reaches staging, #97 must record the actual new SHA, an
independent final Governed Branch Audit and two complete green cycles on exactly
that unchanged SHA. Each cycle needs Branch Policy, Verify, Database integration,
Playwright and Docker Build with matching job links. Any candidate change resets
that evidence. PR #132 remains unmerged until the existing #97 sequence is met;
the owner records GO/NO-GO and no real participant use begins before GO.

## Database and live checks

No schema or migration change is included in this correction. CI's pending-only
rehearsal against scaffold-only `main` is INAPPLICABLE because that base has no
migrations. Fresh replay and the restore drill are useful separate checks; they
do not prove a non-empty production-project upgrade.

The owner still records the real pilot backup, migration list/dry-run/apply and
post-apply match, Vercel production branch/config and deployed SHA, ingress and
spoof resistance, Auth email delivery, live journeys, external uptime and the
Manila zero-day baseline. #87, #97 and #109 retain those live evidence items.
