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

The barrel `src/features/feedback/index.ts` is server-only. It exports the six
use cases, `FeedbackError`, and types. Client code imports the client-safe
schemas and types directly from `schemas.ts` and `types.ts`.

| Operation                                                | Caller                        | Result                                                              |
| -------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| `submitPublicFeedback(input, source?)`                   | Public surfaces               | `{ accepted: true }` after durable write                            |
| `submitProviderFeedback(input)`                          | Authenticated Provider member | `{ accepted: true }` after durable write                            |
| `listInternalFeedback(options?)`                         | Enabled internal operator     | Bounded previews (no message, notes, or nonce)                      |
| `getInternalFeedback(id)`                                | Enabled internal operator     | Original, separate review state, bounded history; `null` if missing |
| `recordFeedbackReview(id, decision, expectedRowVersion)` | Enabled internal operator     | `{ status, priority, rowVersion }`                                  |
| `getFeedbackAggregateSummary(window)`                    | Enabled internal operator     | Count-only summary                                                  |

Errors are `FeedbackError` with a fixed code: `INVALID_INPUT`,
`RATE_LIMITED` (with a bounded `retryAfterSeconds`), `UNAVAILABLE`,
`FORBIDDEN`, `NOT_FOUND`, or `CONFLICT`.

Every entry point sanitizes its failures. An intentional `FeedbackError` keeps
its code. Anything else (a transport error, a failed client creation, a
malformed database response, an unexpected auth throw) becomes `UNAVAILABLE`
with no original message. Logs carry only a fixed operation name and a
SQLSTATE-shaped code, never SQL text, messages, input, or error payloads.

## Trust and classification

- **Public submission:** the source is a trusted server argument, validated
  against `PUBLIC_TRACKING`, `PUBLIC_REQUEST`, or `PUBLIC_FEEDBACK`, and
  defaults to `PUBLIC_FEEDBACK`. A malformed source is `INVALID_INPUT`, and it
  is checked after the budget is spent. The participant class is always
  `PUBLIC_SELF_REPORTED_CUSTOMER`.
- **Provider submission:** `requireProviderContext()` resolves membership first.
  `UNAUTHENTICATED` and `NO_MEMBERSHIP` map to `FORBIDDEN`. Any other auth
  failure maps to `UNAVAILABLE`. The class is derived from the authenticated
  membership: `SHOP` + `OWNER` → `SHOP_OWNER`, `SHOP` + `STAFF` →
  `SHOP_STAFF`, `INDEPENDENT` → `INDEPENDENT_REPAIRER`. The source is
  `PROVIDER_WORKSPACE`.
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
2. One limiter call. A denial, a limiter failure, or a malformed limiter result
   stops here, so nothing is parsed or written. A denial's retry value is
   clamped to 1–86,400 seconds. A non-finite retry value fails closed.
3. Source check (public path) and parse of the browser input.
4. `submit_feedback` through the service-role public operation client.
5. Accept the RPC result only when it is exactly `ACCEPTED`.

Invalid input still consumes budget. Retries reuse the same
`submissionNonce`, so the database makes a retry a no-op and returns the same
receipt.

## Validation bounds

Validation matches the `feedback_submissions` constraints:

- Text is trimmed of ASCII edge whitespace only (space, tab, LF, CR, FF, VT).
- Length counts Unicode code points.
- `title`: optional, 1–120 when present; absent, `null`, or blank becomes `null`.
- `message`: required, 1–2,000.
- `internalNotes`: required key holding a string or an explicit `null`, 1–2,000
  characters when text. `null` or blank clears the stored notes. An omitted key
  is `INVALID_INPUT`.
- `reason`: optional, 3–500; absent, `null`, or blank becomes `null`.
- NUL (U+0000) cannot be stored in PostgreSQL text, so it is rejected. So are
  U+0001–U+0008, U+000E–U+001F, and U+007F. TAB, LF, VT, FF, and CR remain
  allowed.
- `linkedIssueUrl`: required key holding a string or an explicit `null`, at most
  2,000 code points. It must be exactly a
  canonical `https://github.com/Jacinth091/Tracknologia/issues/<n>` link. The
  raw value must equal the parsed URL, so query strings, fragments,
  credentials, ports, and alternate spellings are rejected rather than
  normalized. `null` or blank clears it; an omitted key is `INVALID_INPUT`.
- `expectedRowVersion`: an integer from 1 to 2,147,483,647 (the PostgreSQL
  `INTEGER` range).
- List cursor: `<created_at>|<id>`. The timestamp must parse as a real instant,
  and the id must be a UUID. A nonsense value is rejected before any filter is
  built.

## Internal reads and the access audit

Each of the four internal operations calls `requireInternalOperator()` first.
A denial returns `FORBIDDEN`, and an unavailable guard returns `UNAVAILABLE`.
Both happen before any query and before input is parsed.

The three protected reads (list, detail, summary) then call
`recordSensitiveInternalAccess("INTERNAL_ACCESS_VIEW")` before their privileged
query. An audit failure returns `UNAVAILABLE`, and protected data is withheld.

Review does not add that audit. Its guard is the denial check, and its
per-feedback history is the durable record of the write. Its only read is the
minimal status and version precondition.

Previews exclude `message`, `internal_notes`, and `submission_nonce`. Detail
returns the original submission, the review state, and history as separate
blocks. History returns the newest 100 events by `row_version`, presented oldest-first,
and reports truncation when older events exist.
Lists use keyset pagination on `(created_at, id)`, with a page size of 50.

## Review transitions

`recordFeedbackReview` checks, in order: the operator guard, input shape, the
current row (`NOT_FOUND` if missing), the expected row version (`CONFLICT` if
stale), and the transition table. The table mirrors `record_feedback_review`:

- Repeating the current status is an edit (version and history still advance).
- `NEW` → `REVIEWING` or `DISMISSED`.
- `REVIEWING` → `PLANNED`, `RESOLVED`, or `DISMISSED`.
- `PLANNED` → `RESOLVED`, `REVIEWING`, or `DISMISSED`.
- `RESOLVED` or `DISMISSED` → `REVIEWING` requires a reason.

The database rechecks the operator, the version, and the transition under
lock. Each review commits the row update and its history event together. The
function returns the version it wrote. That value must be exactly the expected
version plus one, or the response is treated as malformed.

Review is a full replacement. `internalNotes` and `linkedIssueUrl` are required
keys in every decision: send the current text to keep it, or `null` to clear it.
An omitted key is rejected before any read or write, so a status-only edit cannot
erase stored text.
Original submitted text is never modified.

## Count-only summary

`getFeedbackAggregateSummary` takes Asia/Manila calendar dates: 1–31 days, with
`startDate` inclusive and `endDateExclusive`. Each boundary is converted to a UTC
instant with the fixed +08:00 offset (Manila keeps no daylight saving time). The
result labels `window.timeZone` as `Asia/Manila`. It makes one call to
`get_feedback_count_summary`, which returns fixed groups only:

- category, source, and status counts for submissions created in the window;
- a daily count for each Asia/Manila day, with zero-filled days.

The database returns sparse groups. The feature module (`queries.ts`) fills in
missing groups and days, so the summary always lists every category, source,
status, and day in the window.

`status` is a **current snapshot**, not a historical transition count.
`retention` reports `UNAPPROVED` and `RETAINED_ROWS_ONLY`, so the summary
never implies an all-time total. No row identifiers, text, nonce, or
reviewer identity appear in the result.

## Module ownership

- `persistence.ts` owns database access only. Every RPC and select response is
  validated at that boundary by a compact schema, and it maps only the declared
  fields. Malformed responses become `UNAVAILABLE`. The raw database client is
  never exported.
- `queries.ts` owns the summary projection and the reads' composition.
- `commands.ts` owns the write rules: budget, trusted classification, the
  transition table, and the review precondition.
- `errors.ts` owns the safe failure boundary and its logging.

## Explicit non-goals

- No UI, routes, notifications, or support inbox (#91, #92 and later).
- No Feedback reference on Repair, Repair Request, or Tracking records.
- No public lookup, receipt identifier, or status endpoint.
- No new tables beyond #89 (one aggregate RPC only).
- Retention and erasure remain launch gates (issue #87).

## Tests

- `src/features/feedback/feedback.test.ts` mocks the auth, limiter, Supabase
  client, and access seams. It covers limiter-first ordering and clamping,
  forged-field rejection, Provider class derivation and auth mapping, guard
  denial and unavailability for all four internal operations, audit failure for
  the three protected reads, review preconditions and transitions, null
  clearing, RPC error and malformed-response mapping, sanitized transport and
  client failures with log-canary checks, and schema bounds.
- `tests/integration/feedback.db.test.ts` covers the summary RPC grants, the
  denial of unprovisioned and revoked operators, and window shape.
- `tests/integration/feedback-summary-manila.db.test.ts` runs the summary entry
  against PostgreSQL around Manila midnight. It uses baseline deltas for
  isolation, and it checks the window label, the excluded boundary instants,
  the Nov 1 day count, zero-fill, and a text canary.
- `tests/integration/feedback-review-flow.db.test.ts` runs the review entry
  against PostgreSQL. An incomplete decision leaves the row, version, and
  history unchanged, and an explicit null clear adds one version and one event.
- `tests/integration/feedback-projection.db.test.ts` runs the persistence
  functions against PostgREST. It checks bounded keyset paging across a tied
  `created_at`, the preview projection keys, detail and history with truncation
  at 100 events, and null clearing at the database.
