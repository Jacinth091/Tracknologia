# Feature — Feedback

**Code location:** `src/features/feedback/`

## Description

The Feedback feature records private product feedback from Customers using
public surfaces and from Provider members, and gives internal operators a
bounded way to review it. It owns validation, trusted participant
classification, the shared abuse budget, review transitions, internal reads,
and count-only summaries.

It is a Module with a small Interface. It has no UI, no routes, no
notifications, and no coupling to Repairs, Repair Requests, or Tracking. Route
adapters (#91, #92) pass only browser input.

## Primary goal

Let people report bugs, usability problems, feature requests, and general
comments without any identity or authority being taken from the browser, and
let operators review them without exposing raw text to Provider users.

## Public Interface

| Operation                                                | Caller                        | Result                                                              |
| -------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| `submitPublicFeedback(input, source?)`                   | Public surfaces               | `{ accepted: true }` after durable write                            |
| `submitProviderFeedback(input)`                          | Authenticated Provider member | `{ accepted: true }` after durable write                            |
| `listInternalFeedback(options?)`                         | Enabled internal operator     | Bounded previews (no message, notes, or nonce)                      |
| `getInternalFeedback(id)`                                | Enabled internal operator     | Original, separate review state, bounded history; `null` if missing |
| `recordFeedbackReview(id, decision, expectedRowVersion)` | Enabled internal operator     | `{ status, priority, rowVersion }`                                  |
| `getFeedbackAggregateSummary(window)`                    | Enabled internal operator     | Count-only summary                                                  |

Errors are `FeedbackError` with a fixed code: `INVALID_INPUT`,
`RATE_LIMITED` (with `retryAfterSeconds`), `UNAVAILABLE`, `FORBIDDEN`,
`NOT_FOUND`, or `CONFLICT`. Messages never echo submitted text, identifiers,
SQL errors, or credentials.

## Trust and classification

- **Public submission:** the source is a trusted server argument, validated
  against `PUBLIC_TRACKING`, `PUBLIC_REQUEST`, or `PUBLIC_FEEDBACK`, and
  defaults to `PUBLIC_FEEDBACK`. The participant class is always
  `PUBLIC_SELF_REPORTED_CUSTOMER`.
- **Provider submission:** `requireProviderContext()` resolves membership first.
  The class is derived from the authenticated membership: `SHOP` + `OWNER` →
  `SHOP_OWNER`, `SHOP` + `STAFF` → `SHOP_STAFF`, `INDEPENDENT` →
  `INDEPENDENT_REPAIRER`. The source is `PROVIDER_WORKSPACE`.
- **Forged fields:** input is parsed by a strict schema. Keys such as `source`,
  `participantClass`, `status`, `priority`, `reviewedBy`, `providerId`, or
  `userId` are rejected with a generic message, and they never affect the
  stored row.
- **Reviewer identity:** derived inside the operator guard. The browser never
  supplies it.

## Abuse control and ordering

Public and Provider submissions share one `feedback_submit` budget
(`PUBLIC_ABUSE_FEEDBACK_MAX` / `PUBLIC_ABUSE_FEEDBACK_WINDOW_SECONDS`, default
5 per 600 seconds), which is independent of the tracking and Repair Request
counters.

The order is fixed:

1. Provider membership (Provider path only).
2. Limiter. A denial or limiter failure stops here, so nothing is parsed or written.
3. Parse and validate.
4. `submit_feedback` through the service-role public operation client.
5. Accept the RPC result only when it is exactly `ACCEPTED`.

Invalid input still consumes budget. Retries reuse the same
`submissionNonce`, so the database makes a retry a no-op and returns the same
receipt.

## Validation bounds

Validation matches the `feedback_submissions` constraints:

- Text is trimmed of ASCII edge whitespace only (space, tab, LF, CR, FF, VT).
- Length counts Unicode code points.
- `title`: optional, 1–120 when present; blank becomes `null`.
- `message`: required, 1–2,000.
- `internalNotes`: optional, 1–2,000; blank clears them.
- `reason`: optional, 3–500; blank becomes `null`.
- U+0001–U+0008, U+000E–U+001F, and U+007F are rejected in text.
- `linkedIssueUrl`: only a canonical `https://github.com/Jacinth091/Tracknologia/issues/<n>`
  link with no credentials, port, query, or fragment. The stored value is the
  normalized URL.

## Internal reads and the access audit

Every internal read calls `requireInternalOperator()` and then
`recordSensitiveInternalAccess("INTERNAL_ACCESS_VIEW")` before the privileged
query.

- A denial stops before any query and returns `FORBIDDEN`.
- An audit failure returns `UNAVAILABLE`, and protected data is withheld.

Previews exclude `message`, `internal_notes`, and `submission_nonce`. Detail
returns the original submission, the review state, and history as separate
blocks. History is bounded to 100 events and reports truncation explicitly.
Lists use keyset pagination on `(created_at, id)`, with a page size of 50.

## Review transitions

`recordFeedbackReview` checks, in order: input shape, operator, current row
existence, the expected row version (precondition), and the transition table.
The table mirrors `record_feedback_review`:

- Repeating the current status is an edit (version and history still advance).
- `NEW` → `REVIEWING` or `DISMISSED`.
- `REVIEWING` → `PLANNED`, `RESOLVED`, or `DISMISSED`.
- `PLANNED` → `RESOLVED`, `REVIEWING`, or `DISMISSED`.
- `RESOLVED` or `DISMISSED` → `REVIEWING` requires a reason.

The database rechecks the operator, the version, and the transition under
lock. Each review commits the row update and its history event together.
`internalNotes` and `linkedIssueUrl` are replaced on each review, so the form
must send the full current values. Original submitted text is never modified.

## Count-only summary

`getFeedbackAggregateSummary` takes a UTC window of 1–31 days
(`startDate` inclusive, `endDateExclusive`). It makes one call to
`get_feedback_count_summary`, which returns fixed groups only:

- category, source, and status counts for submissions created in the window;
- a daily count for each UTC day, with zero-filled days.

`status` is a **current snapshot**, not a historical transition count.
`retention` reports `UNAPPROVED` and `RETAINED_ROWS_ONLY`, so the summary
never implies an all-time total. No row identifiers, text, nonce, or
reviewer identity appear in the result.

## Explicit non-goals

- No UI, routes, notifications, or support inbox (#91, #92 and later).
- No Feedback reference on Repair, Repair Request, or Tracking records.
- No public lookup, receipt identifier, or status endpoint.
- No new tables beyond #89 (one aggregate RPC only).
- Retention and erasure remain launch gates (issue #87).

## Tests

- `src/features/feedback/feedback.test.ts` mocks the real seams. It proves
  limiter ordering, forged-field rejection, Provider class derivation,
  no-query denials, audit-failure withholding, review precondition and
  transition rejections, and schema bounds.
- `tests/integration/feedback.db.test.ts` (PostgreSQL) covers the summary
  RPC's grants, denial for unprovisioned and revoked operators, window
  rejection, and exact mixed-fixture counts with a canary check.
