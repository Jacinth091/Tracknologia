# Feature — Feedback

**Code location:** `src/features/feedback/`

## Description

The Feedback feature records private product feedback from Customers using
public surfaces and from Provider members, and gives internal operators a
bounded way to review it. It owns validation, trusted participant
classification, the shared abuse budget, review transitions, internal reads,
and count-only summaries.

It is a Module with a small Interface, with no coupling to Repairs, Repair
Requests, or Tracking. Participant forms (#91) are thin route adapters:
`src/app/(public)/feedback/` for anonymous visitors and Customers, and
`src/app/(provider)/dashboard/feedback/` for Provider members. They pass only
browser input to `submitFeedbackForm`; the public page always records
`PUBLIC_FEEDBACK`. Their copy and inline privacy notice were owner-approved on
2026-10-30 (#87). Feedback is kept, with a personal review within 90 days: the
team removes or redacts personal details, or deletes feedback that is not
useful, through the runbooks in `docs/OPERATIONS.md`. Inbox tooling for that
review queue is the "Due for review" filter (#108); see the 90-day procedure in
`docs/OPERATIONS.md`.
The internal operator inbox (#92) is also a rendered surface:
`src/app/(internal)/internal/feedback/` lists bounded previews, shows
the bounded original text to enabled operators only, and adapts triage
decisions through `recordFeedbackReview`. The adapter passes only browser
input; the operator, transition allow-list, optimistic version and audit
entries stay inside the Module.

## Primary goal

Let people report bugs, usability problems, feature requests, and general
comments without any identity or authority being taken from the browser, and
let operators review them without exposing raw text to Provider users.

## Public Interface

The barrel `src/features/feedback/index.ts` is server-only. It exports the six
use cases, `submitFeedbackForm`, `FeedbackError`, and types, including
`FeedbackFormState`. Client code imports the client-safe schemas and types
directly from `schemas.ts` and `types.ts`, and the shared participant form
component from `ui/feedback-form.tsx`.

| Operation                                                | Caller                        | Result                                                              |
| -------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| `submitPublicFeedback(input, source?)`                   | Public surfaces               | `{ accepted: true }` after durable write                            |
| `submitProviderFeedback(input)`                          | Authenticated Provider member | `{ accepted: true }` after durable write                            |
| `listInternalFeedback(options?)`                         | Enabled internal operator     | Bounded previews (no message, notes, or nonce)                      |
| `getInternalFeedback(id)`                                | Enabled internal operator     | Original, separate review state, bounded history; `null` if missing |
| `recordFeedbackReview(id, decision, expectedRowVersion)` | Enabled internal operator     | `{ status, priority, rowVersion }`                                  |
| `getFeedbackAggregateSummary(window)`                    | Enabled internal operator     | Count-only summary                                                  |

`submitFeedbackForm(formData, submit)` is the participant form adapter, not a
use case. It reads only `category`, `title`, `message`, and `submissionNonce`
from `FormData`, passes them to the supplied submit function, and maps the
outcome to a `FeedbackFormState`. A rejected attempt keeps the typed values and
a valid nonce, so a retry stays idempotent. Acceptance returns a fresh nonce.

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
  stored row. The participant form adapter reads only its four form fields
  from `FormData`, so extra fields never reach the strict schema.
- **Reviewer identity:** derived inside the operator guard. The browser never
  supplies it.

## Abuse control and ordering

Public and Provider submissions share one `feedback_submit` budget
(`PUBLIC_ABUSE_FEEDBACK_MAX` / `PUBLIC_ABUSE_FEEDBACK_WINDOW_SECONDS`, default
20 per 600 seconds), which is independent of the tracking and Repair Request
counters.

The order is fixed:

1. Provider membership (Provider path only).
2. One limiter call. A denial, a limiter failure, or a malformed limiter result
   stops here, so nothing is parsed or written. A denial's retry value is
   clamped to 1–86,400 seconds. A non-finite retry value fails closed.
3. Source check (public path) and parse of the browser input.
4. `submit_feedback` through the service-role public operation client.
5. Accept the RPC result only when it is exactly `ACCEPTED`.

Invalid input still consumes budget. An identical retry reuses the same
`submissionNonce`, so the database makes it a no-op and returns the same
receipt. An edited retry gets a new nonce (see Participant form).

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

Each preview carries `mayContainContactDetails`. The server computes it from the
title and message with the same `looksLikeContactDetails` hint the participant
form uses. Persistence reads the message only for that check, and the preview
never returns it. The flag is a hint for operators, not a guarantee: it can miss
details, so the operator still reads the original before deciding what to redact.

The list also accepts `dueForReview`, exposed in the inbox as the `due=1` filter
"Due for review (90+ days)". It keeps only submissions created more than 90 days
ago, with the cutoff computed on the server at query time, and whose
`privacy_reviewed_at` is null (#87 decision 7, #108). Privacy review is recorded
by the owner-run redaction block, the purge block, or the "Mark privacy review
done (kept)" block in `docs/OPERATIONS.md`. Each one leaves the queue, so a
reviewed useful item does not reappear.

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
`retention` reports `APPROVED` and `RETAINED_ROWS_ONLY`, so the summary
never implies an all-time total. No row identifiers, text, nonce, or
reviewer identity appear in the result.

## Participant form

The shared client form in `ui/feedback-form.tsx` adds three behaviours on top of
the server contract:

- **Personal-details reminder and warning.** The reminder always shows under the
  Message label. `contact-details.ts` checks the title and message as the
  participant types, for an email address, a Philippine mobile number, or a `+`
  number of 9 or more digits. It shows a warning and never blocks a submission.
  The check runs only in the browser, and no text leaves it for this purpose.
- **Nonce rotation.** A rejected attempt keeps its nonce, so an identical resend
  is a no-op in the database. A changed category, title, or message gets a fresh
  nonce, so an edited retry is stored as a new submission (C-01).
- **Lost responses.** The form submits through a client wrapper. If the action
  throws, the wrapper returns an unconfirmed state with the "not sure" copy, and
  it keeps the nonce that was sent, so an identical retry is safe.

Tradeoff (C-03, accepted): the wrapper means that before the page hydrates, or
without JavaScript, the form does not submit through the server action, and the
lost-response handling is unavailable.

Privacy notice: the approved text lives once in `ui/feedback-privacy-notice.tsx`.
The form shows it inside the "How we handle your feedback" box and links to
`/privacy`, whose Section 1 renders the same component, open. Changing the text
needs a new owner decision on #87.

Placement (C-04): `ui/` is deliberate. Two route groups (public and Provider)
import the form, and the feature barrel is server-only. It is not a pattern for
other features to copy.

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

- No notifications, replies, or support engagement. Inbox tooling for the 90-day
  personal-review queue is a follow-up issue.
- No Feedback reference on Repair, Repair Request, or Tracking records.
- No public lookup, receipt identifier, or status endpoint.
- No new tables beyond #89 and the owner-only `feedback_privacy_audit` (one
  aggregate RPC only).
- Retention follows the #87 review model: a 90-day personal review, then
  redaction or deletion. Redaction and purge are
  owner-run SQL in `docs/OPERATIONS.md` ("Feedback redaction and deletion"),
  each a separate rollback-first transaction. They are not a product or
  Provider feature, and no participant surface is enabled by them.

## Tests

- `src/features/feedback/feedback.test.ts` mocks the auth, limiter, Supabase
  client, and access seams. It covers limiter-first ordering and clamping,
  forged-field rejection, Provider class derivation and auth mapping, guard
  denial and unavailability for all four internal operations, audit failure for
  the three protected reads, review preconditions and transitions, null
  clearing, RPC error and malformed-response mapping, sanitized transport and
  client failures with log-canary checks, and schema bounds.
- `src/features/feedback/form.test.ts` calls `submitFeedbackForm` directly with
  real `FormData` and a fake submit function. It covers acceptance and nonce
  rotation, the exact four-field input, field errors with kept values, the
  malformed-nonce replacement, the rate-limit, forbidden, and unavailable copy,
  and unexpected errors that never reveal their text in state or logs.
- `tests/contracts/feedback-ui.contract.test.tsx` renders the shared form
  (category radios and prompts, field-error wiring, pending, alert, accepted
  receipt), the plain `/feedback` links from Tracking and the Request receipt,
  the Provider nav Feedback item by role, the two pages' nonce and
  Provider-context wiring, the personal-details warning, and the wrapper's
  unconfirmed path and nonce rotation, captured through the mocked
  `useActionState`.
- `src/features/feedback/contact-details.test.ts` covers the phone and email
  positives and the device, year, quantity and IMEI negatives.
- `tests/e2e/feedback.spec.ts` (E2E-10) drives the real forms: an anonymous
  visitor reaches `/feedback` from `/track`, sees the warning appear and clear,
  and stores four categories with the public source and class; a 121-character
  title is refused in place; the twenty-first submission in a window is
  throttled after 20 accepted; each Provider role stores its
  trusted class and `PROVIDER_WORKSPACE`; and the form fits a 375px viewport.
  Every scenario resets the shared `feedback_submit` limiter row before and
  after, scopes its reads to a per-run title marker, and deletes its rows
  through trusted SQL before its actors are removed.
- `tests/integration/feedback.db.test.ts` covers the summary RPC grants, the
  denial of unprovisioned and revoked operators, and window shape.
- `tests/integration/feedback-summary-manila.db.test.ts` is a direct SQL proof of
  the summary function's Manila-aligned bounds. The unit test above covers the
  Manila-to-UTC conversion and the response label. This file uses one psql session
  inside a `REPEATABLE READ` transaction. It takes baselines, creates and pins
  only its own fixtures through the existing RPCs, reads again in the same
  snapshot, and rolls back. Concurrent committed writes cannot change its deltas.
  It checks the start and exclusive-end instants, the Nov 1 PHT day bucket, and
  zero-fill. It does not exercise the feature entry or PostgREST.
- `tests/integration/feedback-review-flow.db.test.ts` runs the review entry
  against PostgreSQL. An incomplete decision leaves the row, version, and
  history unchanged, and an explicit null clear adds one version and one event.
- `tests/integration/feedback-privacy.db.test.ts` executes the documented
  redaction and purge blocks from `docs/OPERATIONS.md` against PostgreSQL after
  replacing only their placeholders. The rehearsal default discards every change.
  Committed proofs use fixtures created for that test only and cover retained
  redaction history, a stale pre-redaction version rejected, purge limited to
  the approved target, and the audit rolled back with the mutation when it fails.
  Grants deny clients, and a routine access view keeps a null reason.
- `tests/integration/feedback-projection.db.test.ts` runs the persistence
  functions against PostgREST. It checks bounded keyset paging across a tied
  `created_at`, the preview projection keys, detail and history with truncation
  at 100 events, and null clearing at the database.
