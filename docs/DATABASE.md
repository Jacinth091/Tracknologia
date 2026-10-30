# Database Design & Migration Rules

Tracknologia uses PostgreSQL managed through Supabase.

The MVP intentionally favors a small schema with sufficiently rich rows rather than premature normalization.

---

## Core Application Tables & Projections

```text
providers
provider_user_profiles
provider_memberships
provider_invitations
public_provider_profiles (view)
provider_service_modes
repair_requests
repairs
repair_status_events
repair_updates

Validation telemetry:
tracking_events

Short-lived operational security state:
public_operation_rate_limits

Private internal operations (issue #88):
internal_operators
internal_access_audit

Private Feedback (issue #89):
feedback_submissions
feedback_review_events

Owner-only Feedback privacy audit (PR #105 review):
feedback_privacy_audit
```

Authentication identities live in Supabase-managed `auth.users`.

---

## Relationships

```text
auth.users
    │
    ├──< provider_user_profiles (1:1 canonical person profile)
    │
    ├──< provider_memberships >── providers
    │                             │
    ├──< provider_invitations <───┤ (Staff invitations)
    │                             │
    │                             ├──< provider_service_modes
    │                             ├──< repair_requests
    │                             │       │
    │                             │       └── 0..1 accepted source
    │                             │                │
    │                             └──< repairs <───┘
    │                                     │
    │                                     ├──< repair_status_events
    │                                     ├──< repair_updates
    │                                     └──< tracking_events
```

---

## Table Definitions

### 1. `providers`

Represents both Repair Shops and Independent Repairers. Direct table access is restricted to authenticated members; anonymous access uses `public_provider_profiles`.

- `id` (uuid, PK)
- `provider_type` (`SHOP` | `INDEPENDENT`)
- `display_name` (text, 2–120 characters)
- `slug` (text, UNIQUE)
- `description` (maximum 1,000 characters), `profile_image_url` (maximum 2,048)
- `contact_phone` (maximum 40), `contact_email` (maximum 254)
- `public_address` (nullable, maximum 300 for Independent Repairers)
- `service_area` (nullable, maximum 300)
- `supported_devices` (text array, maximum 20 nonblank values of maximum 80 characters each)
- `accepting_requests` (boolean, default true)
- `created_at`, `updated_at` (timestamptz)

### 2. `provider_user_profiles`

Canonical person profile for authenticated provider users (OWNER and STAFF).

- `user_id` (uuid, PK, FK $\to$ `auth.users.id`)
- `display_name` (text, required, 2–120 characters)
- `contact_phone` (text, nullable, maximum 40)
- `avatar_url` (text, nullable, maximum 2,048)
- `created_at`, `updated_at` (timestamptz)

### 3. `provider_memberships`

Connects `auth.users` to Providers (pure authorization relationship link only).

- `id` (uuid, PK)
- `provider_id` (uuid, FK $\to$ `providers.id`)
- `user_id` (uuid, FK $\to$ `auth.users.id`)
- `role` (`OWNER` | `STAFF`, explicit required)
- `created_at` (timestamptz)
- `CONSTRAINT unique_provider_user UNIQUE(provider_id, user_id)`

### 4. `provider_invitations`

Governs secure, Owner-authorized Staff onboarding (LD-01).

- `id` (uuid, PK)
- `provider_id` (uuid, FK $\to$ `providers.id`)
- `email` (text)
- `role` (`STAFF`)
- `token_hash` (text, UNIQUE) — stores one-way SHA-256 cryptographic digest of raw token.
- `invited_by_user_id` (uuid, FK $\to$ `auth.users.id`)
- `created_at`, `expires_at` (7 days default), `accepted_at`, `accepted_by_user_id`, `revoked_at`
- At most one **active pending** invitation per `(provider_id, normalized email)`:
  `create_staff_invitation` serializes competing creates with a Provider+email
  advisory lock, rechecks `accepted_at` / `revoked_at` / `expires_at`, and on an
  existing active pending invite **reuses** it (`reused = true`, no second row,
  digest untouched) instead of inserting another. Expired, revoked, or accepted
  invitations do not count as active and permit a fresh invitation.
- **Recipient eligibility**: `create_staff_invitation` refuses to create or
  reuse an invitation for an email whose account already holds an active
  `provider_memberships` row (the resulting link could never be accepted).
  Its PostgreSQL exception uses SQLSTATE `P0001` with
  `DETAIL = 'RECIPIENT_INELIGIBLE'` so persistence clients can classify this
  outcome without depending on human-readable error text.
  Re-inviting becomes valid again after Owner offboarding removes the
  membership. All three membership-establishing/acquisition paths participate
  in the same recipient-email serialization boundary, keyed by the normalized
  recipient email and taken **in the same order** (recipient-email advisory
  lock, then per-User lock; the per-Provider+email create lock is taken only
  after recipient eligibility):
  - `create_staff_invitation` rechecks eligibility under the recipient-email
    lock;
  - `accept_staff_invitation` creates the membership under the same lock;
  - `create_provider_with_owner` (Owner onboarding, including the composite
    `create_provider_with_owner_and_modes` wrapper, which delegates to it)
    establishes the OWNER membership under the same lock.
    Because every participant serializes on the same email lock, a create vs
    accept race (even when the recipient's Auth User is created mid-create, or
    the create is issued by a different Shop) can never leave an unusable active
    invitation behind.
- **Settlement on membership**: the one-membership rule is per User across
  Providers, so once any Provider membership is established, every other
  currently-active pending invitation for the normalized recipient email is
  superseded (`revoked_at` set) across all Providers. Acceptance and Owner
  onboarding both settle globally this way; a Shop never retains a second
  unusable link after a member joins, and a same-email invitation held by a
  different Shop while the recipient was eligible stops resolving. Cross-Shop
  invitations remain independent while the recipient is still membership-
  eligible.
- `reconcile_staff_invitation_duplicates()` (service-role/admin only) is the
  one-time and on-demand fix for legacy duplicate active invitations: per
  `(provider_id, lower(email))` it keeps only the earliest **currently-valid**
  invitation (unaccepted, unrevoked, `expires_at > now()`) and revokes all
  other currently-valid duplicates; expired rows are left untouched because
  they never resolve. It runs automatically as part of the retry-policy
  migration; raw credentials are never reconstructed.

### 5. `public_provider_profiles` (View)

Public projection exposing only public-safe fields for active providers accepting requests.

- `id`, `provider_type`, `display_name`, `slug`, `description`, `profile_image_url`, `public_address`, `service_area`, `supported_devices`, `service_modes`, `accepting_requests`, `created_at`
- excludes Providers where `accepting_requests = false`
- excludes internal contact fields and `updated_at`

### 6. `provider_service_modes`

Repeating relation of supported modes (`DROP_OFF`, `MEETUP`, `HOME_SERVICE`, `OTHER`).

- `PRIMARY KEY(provider_id, mode)`
- optional `details` with a 240-character check
- authenticated members have read access for their Provider
- direct authenticated writes are denied; Owners use atomic, Provider-serialized `set_provider_service_modes(jsonb)` replacement

### 7. `repair_requests`

Customer-submitted intake awaiting Provider decision (`SUBMITTED`, `ACCEPTED`, `DECLINED`). Not an authoritative Repair.

- Provider ownership, globally unique `REQ-[A-F0-9]{16}` Request Reference,
  customer/device/problem snapshot, optional preferred Service Mode, and
  decision audit columns.
- status defaults `SUBMITTED`; check constraint keeps status, decision time, and
  acting User consistent.
- customer/device/problem text bounds mirror server-side Zod limits.
- `(provider_id, status, submitted_at DESC)` supports inbox filtering.
- authenticated Provider members can read only their Provider rows; direct
  client mutation is denied.
- anonymous submission is available only through `submit_repair_request`, which
  returns Reference + submission time and creates no Repair.

### 8. `repairs`

The authoritative repair record containing customer and device snapshots.

- `repair_request_id` is nullable and unique so one Repair Request can create at most one Repair.
- composite source foreign key requires Request and Repair to share Provider.
- `origin` is `CUSTOMER_REQUEST` for accepted Requests and
  `PROVIDER_CREATED` for direct Provider intake.
- Ticket Number matches `TN-YYYY-[A-F0-9]{10}` and is unique per Provider.
- Tracking Code matches `TRK-[A-F0-9]{24}` and is globally unique.
- customer/device fields are authoritative snapshots; Reported Problem,
  Diagnosis, and Internal Notes remain distinct columns.
- Lifecycle: `IN_PROGRESS`, `WAITING_FOR_PARTS`, `AWAITING_APPROVAL`, `READY`, `COMPLETED`.
- every origin begins `IN_PROGRESS`; later state behavior is implemented by
  Feature 04's locked lifecycle transaction.
- authenticated detail edits are restricted to explicit customer/device and
  Provider-authored columns; identity, origin, lifecycle, identifiers,
  ownership, and timestamps are not client-editable.
- `service_mode` remains a historical Repair snapshot when Provider
  configuration changes. An actual mode update invokes
  `enforce_repair_service_mode_update`, which locks the Provider row `FOR SHARE`
  and rejects an unsupported new non-null value. This serializes with
  `set_provider_service_modes` without adding a foreign key to mutable
  configuration.

### 9. `repair_status_events`

- append-oriented audit log with `from_status`, `to_status`, acting User, and
  timestamp;
- initial event is `NULL -> IN_PROGRESS` and is committed atomically with both
  direct and Request-origin Repair creation;
- later events commit atomically with `current_status` and `completed_at`;
- authenticated reads derive Provider ownership through parent Repair;
- direct client writes are denied.

### 10. `repair_updates`

Customer-visible progress messages independent of status changes. This table is
append-only for authenticated members of the owning Provider. Messages are
nonblank and at most 2,000 characters. RLS derives ownership through the parent
Repair; authenticated roles have no update/delete privilege and anonymous roles
have no raw access.

### 11. `tracking_events`

Minimal internal validation telemetry for successful public Tracking views.

- `id` (uuid, PK)
- `repair_id` (uuid, FK $\to$ `repairs.id`, cascading delete)
- `viewed_at` (timestamptz, server default)
- `(repair_id, viewed_at DESC)` index supports total, distinct-Repair adoption,
  and repeat-view queries
- anonymous and authenticated roles have no direct table privileges or RLS
  policies
- service-role/internal reporting may read the table
- no Tracking Code, customer/Provider snapshot, contact, network, browser,
  fingerprint, Auth, or arbitrary metadata is stored

### 12. `internal_operators`

Private allow-list mapping for internal operators. It is **not** a Provider role,
not an Auth-metadata flag, and not derived from `provider_memberships`.

- `user_id` (uuid, PK, FK $\to$ `auth.users.id`, cascading delete)
- `enabled` (boolean, not null, default `false`)
- `created_at` (timestamptz, server default)
- `provisioned_at`, `revoked_at` (timestamptz, nullable)
- `reason` (bounded 3–200 characters after trimming)
- actor identity is intentionally **not** duplicated here; it lives only in the
  append-only audit event
- one mapping per Auth user; deleting the Auth identity removes live permission
  immediately
- no seed rows, no signup trigger, no Provider/owner automatic grant

### 13. `internal_access_audit`

Append-only audit for internal-operator grants, revocations, and sensitive
internal access events.

- `event_id` (uuid, PK)
- `operator_user_id`, `actor_user_id` (uuid, nullable FKs $\to$ `auth.users.id`,
  `ON DELETE SET NULL`; the FK action runs as the table owner, so nulling the
  direct references does not require client grants)
- `operation` (text, fixed check: `OPERATOR_PROVISIONED`, `OPERATOR_REVOKED`,
  `INTERNAL_ACCESS_VIEW`)
- `reason` (bounded 3–200 characters when present; null for application access
  events)
- `created_at` (timestamptz, server default)
- Auth deletion nulls only the direct user references; `operation`, `reason`,
  and `created_at` remain and may stay linkable through external approval
  records. This is not full anonymization.
- stores no Provider, Repair, Repair Request, Customer, email, path, or payload
  data
- `service_role` can read but cannot insert, update, or delete rows directly;
  writes happen only through the owner-executed functions below
- retention/purge policy remains deliberately undefined pending owner approval
  (issue #87)

### 14. `feedback_submissions`

Private submitted feedback (issue #89). Written only by the service-role
`submit_feedback(...)` RPC, which the public Feedback adapter may call, and
reviewed only by `record_feedback_review(...)`, which the internal operator
adapter calls with a server-resolved operator UUID. The SQL function itself
trusts only the service-role caller.

- `id` (uuid, PK, database-generated; never a public lookup token)
- `submission_nonce` (uuid, unique): client retry key, not identity or
  authorization
- `category` (fixed: `BUG`, `USABILITY`, `FEATURE_REQUEST`, `GENERAL`)
- `source` (fixed: `PUBLIC_TRACKING`, `PUBLIC_REQUEST`, `PUBLIC_FEEDBACK`,
  `PROVIDER_WORKSPACE`) and `participant_class` (fixed: `PUBLIC_SELF_REPORTED_CUSTOMER`,
  `SHOP_OWNER`, `SHOP_STAFF`, `INDEPENDENT_REPAIRER`); public sources may store
  only the public class, and the Provider source may store only the Provider
  classes
- `title` (nullable, trimmed, 1–120 characters) and `message` (required,
  trimmed, 1–2,000 characters)
- `status` (default `NEW`: `NEW`, `REVIEWING`, `PLANNED`, `RESOLVED`,
  `DISMISSED`) and `priority` (default `NORMAL`: `NORMAL`, `HIGH`, `CRITICAL`)
- `internal_notes` (nullable, trimmed, 1–2,000 characters) and
  `linked_issue_url` (nullable; only `https://github.com/Jacinth091/Tracknologia/issues/<positive integer>`,
  at most 2,000 characters)
- `created_at`, `reviewed_at`, `reviewed_by` (nullable FK to `auth.users`,
  `ON DELETE RESTRICT`), `row_version` (starts at `1`, increases on each
  review mutation)
- `privacy_reviewed_at` (nullable `TIMESTAMPTZ`, migration
  `20261102000000_add_feedback_privacy_review_mark.sql`): when an owner-run
  privacy review completed, by the redaction block or the "Mark privacy review
  done (kept)" block. Null means pending. It is set only by those runbooks, never
  by triage or a client role, and it does not change `row_version`. The
  due-for-review queue excludes non-null rows. A migration backfill sets it from
  each existing submission's earliest `FEEDBACK_REDACTED` audit row.
- Text is trimmed of ASCII edge whitespace only (space, tab, LF, CR, FF, VT);
  lengths count PostgreSQL characters, not bytes. Control characters
  U+0001–U+0008, U+000E–U+001F and U+007F are rejected inside `title` and
  `message`; TAB, LF, VT, FF and CR are permitted as content, and only the
  ASCII edge set is trimmed. Original `title` and `message` are not changed
  after insert under normal submission and triage. The one exception is an
  owner-approved privacy redaction run from the trusted SQL runbook in
  `docs/OPERATIONS.md`, which replaces them with `[redacted]` (issue #87 policy
  gate).
- The review-stamp CHECK ties `row_version = 1` to no review and any later
  version to a recorded `reviewed_at`/`reviewed_by`.
- Schema semantics for a privacy touch on a never-reviewed row: the owner
  redaction raises `row_version` to `2` and fills `reviewed_at`/`reviewed_by`
  only where they are null, to satisfy the existing CHECK. Those stamps are
  administrative metadata. They do not mean triage occurred. The row keeps
  `status` `NEW`, `priority` `NORMAL`, and an empty review history. Existing
  stamps are kept when present. Triage is shown by review events and status.
  The redaction also sets `privacy_reviewed_at`.
- Indexes: `(created_at DESC, id DESC)` and `(status, created_at DESC, id DESC)`.
- No participant identity, Provider ID, IP, browser metadata, Repair IDs,
  tracking codes, or device fields are stored.

### 15. `feedback_review_events`

Append-only per-feedback review history (issue #89). It is separate from
`internal_access_audit`, which deliberately carries no feedback identifiers.

- `event_id` (uuid, PK), `feedback_id` (FK, `ON DELETE RESTRICT`),
  `operator_user_id` (FK to `auth.users`, `ON DELETE RESTRICT`)
- `from_status`, `to_status`, `priority_before`, `priority_after` (fixed
  values), `row_version` (version after this event; greater than `1`)
- `reason` (nullable, trimmed, 3–500 characters; required for reopening from
  `RESOLVED` or `DISMISSED`)
- `occurred_at` (server default); index `(feedback_id, occurred_at, event_id)`
- Never copies `title`, `message`, or `internal_notes` text. The owner-run
  redaction runbook sets prohibited free-text `reason` values to null; it adds
  no event and bumps only `feedback_submissions.row_version`.
- Referenced feedback and reviewer identities cannot be deleted while history
  exists, so the audit trail is not removed by accident. The owner-run purge
  runbook is the only path that deletes this history, and it records itself in
  `feedback_privacy_audit`. Feedback is kept. Within 90 days an operator reviews
  it and redacts personal details or deletes it through the owner-run runbooks in
  `docs/OPERATIONS.md`. Retention for the other data classes is still open in
  issue #87.

`get_feedback_count_summary(p_operator_user_id, p_window_start, p_window_end)`
(issue #90) is a service-role-only, set-based aggregate. It returns `(dimension,
bucket, row_count)` rows for categories, sources, current statuses, and Asia/Manila days
in a window of at most 31 days, with no row content or identifiers. It adds no
table and no column.

### 15a. `feedback_privacy_audit`

Append-only audit of owner-run Feedback redaction and purge (PR #105 review).
It is separate from `internal_access_audit`, which stays access-only.

- `event_id` (uuid, PK), `operation` (fixed: `FEEDBACK_REDACTED`,
  `FEEDBACK_PURGED`, `FEEDBACK_PRIVACY_REVIEWED`), `target_feedback_id` (uuid, **no** foreign key, so it
  survives a purge), `actor_user_id` (FK to `auth.users`, `ON DELETE SET NULL`),
  `approval_ref` (3–80 characters of letters, digits and `#._/:-`), `created_at`
- RLS enabled with no policies. `service_role` has `SELECT` only; `PUBLIC`,
  `anon`, and `authenticated` have no privilege.
- Written only inside the owner-run runbook transaction in `docs/OPERATIONS.md`,
  in the same transaction as the redaction, purge or privacy-review mark. Never
  holds participant text.
- Retention is part of the open issue #87 policy decision and is not defined.

### 16. `get_internal_validation_metrics`

`get_internal_validation_metrics(p_operator_user_id, p_window_start, p_window_end)`
(issue #93) is a service-role-only, set-based aggregate over the authoritative
domain tables for internal operator dashboards. It returns fixed
`(dimension, bucket, row_count, interval_seconds, as_of)` groups only, where
`interval_seconds` is the mean request decision lag (seconds) for the decision
measures. No table and no column is added. It adds no provider series and no row
identifiers, and identifiers may only enter `COUNT` or `COUNT(DISTINCT ...)`
groupings inside the function.

- Window: inclusive start, exclusive end, at most 90 Asia/Manila days; finite
  bounds must align with Manila midnight. Future starts and ends beyond the
  next Manila midnight are rejected. The application derives the UTC bounds.
- Every row shares one database-generated `as_of`, captured after the operator
  mapping lock. Period event observations stop at `min(window_end, as_of)`;
  snapshots are current retained state, not reconstructed historical state.
- Measures return `(dimension, bucket, row_count)`: onboarding by type and
  all-time, active/repeat Provider activity, `ACTIVE_DAY` series buckets, staff
  snapshot, current Repair statuses, Repair created/completed/READY/maintenance,
  request received/decided/pending/cohort measures, mean decision seconds, and
  Tracking observations/adoption.
- Request cohort measures use `repair_requests.submitted_at` inside the window;
  decision measures use `accepted_at`/`declined_at` inside the window, so the
  cohort never shifts when a later decision lands.
- Operator mapping is rechecked under `FOR SHARE` so a concurrent revocation
  serializes against this read; the function fails closed on a missing or
  disabled mapping.
- It adds no table, no column, and no table policy. The Feedback trend is not
  duplicated here; it is read through the Feedback summary interface
  (`get_feedback_count_summary`) in disjoint windows of at most 31 days. The
  application records their separate freshness, not a common atomic snapshot.

### 17. Public Tracking projection

`lookup_public_repair(text)` is a read-only `SECURITY DEFINER` function rather
than a table or unrestricted view. It normalizes a bounded Tracking Code and
returns only Provider display name, device type/brand/model, current status,
selected Service Mode, computed last activity time, the customer's own
reported problem (with the Repair `created_at` for `TRK-` codes, or
`repair_requests.submitted_at` for `REQ-` codes), and at most 25 Customer
Update message/timestamp objects. For `REQ-` codes the reported problem falls
back to the linked Repair's value once the Request is accepted. It
intentionally excludes customer identity,
contact data, private technical fields, Ticket Number, credentials, internal
ids, actors, and audit history. The existing globally unique
`repairs.tracking_code` index supports the lookup.

`record_successful_tracking_view(text)` is a separate `SECURITY DEFINER`
function used after successful projection validation. It applies the same
bounded credential normalization, resolves the Repair internally, inserts only
Repair correlation plus server time, and returns no existence or Repair data.
Analytics failure is handled by the application and does not invalidate a
successful public lookup.

---

## Supabase Migration Rules & Lifecycle

These rules govern all database changes and are derived from `docs/Tracknologia_Supabase_Migration_Rules.md`.

### 1. Core Migration Rule

> **A committed migration represents an intentional database transition, not a debugging diary.**

- **Experimental Phase**: During active feature development with disposable development databases, migrations may be corrected, squashed, or replaced.
- **Accepted Phase**: Once reviewed and approved by the Technical Lead as part of an accepted shared baseline, migrations become **immutable**. All subsequent modifications must be authored as new forward migrations.

### 2. Location & Naming

All migration files reside in `supabase/migrations/` using timestamped descriptive filenames:

```text
supabase/migrations/YYYYMMDDHHMMSS_action_target.sql
```

_Good_: `20260820000001_create_provider_identity.sql`
_Avoid_: `fix.sql`, `temp_workaround.sql`, `fix_rls_again.sql`

### 3. Fresh-Database Reproducibility

Every migration chain must apply cleanly from an empty database to full schema, RLS, and functions without manual interventions or dashboard-only patches:

```bash
npx supabase db push
```

### 4. Row Level Security & Least Privilege

- **Mandatory RLS**: Enabled on all provider-owned tables (`providers`, `provider_user_profiles`, `provider_memberships`, `provider_invitations`, `repairs`, etc.).
- **Prohibited Client Self-Assignment**: Direct client `INSERT` on `provider_memberships` is strictly forbidden.
- **Atomic SECURITY DEFINER Procedures**:
  - `create_provider_with_owner(...)`: Transactionally provisions new Provider, initial business profile, person profile, and links caller as explicit `OWNER`.
  - `create_provider_with_owner_and_modes(...)`: Composes the accepted creation procedure with description/request configuration and Service Mode replacement in the same transaction.
  - `set_provider_service_modes(service_modes)`: Owner-only atomic replacement of repeating Service Mode configuration, serialized with a Provider-row lock.
  - `accept_staff_invitation(token_hash, display_name, contact_phone)`: Transactionally locks invitation, verifies SHOP provider and single active membership invariant, enforces strict recipient email binding (a missing or mismatched authenticated email is rejected; comparison is case-insensitive), creates person profile and `STAFF` membership, marks token accepted, and supersedes every other currently-active pending invitation for the normalized recipient email across Providers.
  - `create_staff_invitation(email, token_hash)`: OWNER-only, SHOP-only creation
    that enforces the one-active-pending-invitation invariant and the
    recipient-eligibility rule (an active member's email is refused); returns
    the existing active pending invite (`reused = true`, no insert) rather than
    creating a duplicate.
  - `reconcile_staff_invitation_duplicates()`: service-role maintenance RPC
    that deterministically reduces legacy duplicate active invitations to one
    (earliest) per Provider + email (see §4 `provider_invitations`).
  - `remove_staff_member(membership_id)`: OWNER-only Staff offboarding that
    locks the target membership, removes exactly one same-Provider `STAFF`
    row, refuses OWNER targets, and returns a neutral `false` for
    not-found/cross-Provider/non-STAFF targets.
  - `submit_repair_request(...)`: Public allow-listed submission that locks the
    Provider configuration and verifies current Request availability/mode.
  - `decline_repair_request(request_id)`: Provider-authorized terminal decline
    with Request row locking.
  - `create_repair_from_request(request_id, verified_input...)`: Provider-
    authorized Request lock plus atomic Repair, initial Status Event, and
    accepted Request state.
  - `create_provider_repair(input...)`: Provider-authorized direct Repair plus
    initial Status Event committed atomically.
  - `change_repair_status(repair_id, next_status)`: Provider-authorized Repair
    row lock, exact transition recheck, status/event update, and completion
    timestamp maintenance.
- **Restricted public read function**: `lookup_public_repair(tracking_code)`
  returns the fixed customer-safe Repair projection and latest 25 Customer
  Updates without granting raw table access.
- **Restricted public observation function**:
  `record_successful_tracking_view(tracking_code)` returns no data and writes
  only minimal internal telemetry for an existing Repair without granting raw
  `tracking_events` access.
- **Public operation functions are service-role only**: EXECUTE on
  `lookup_public_repair`, `record_successful_tracking_view`, and
  `submit_repair_request` is revoked from `anon`/`authenticated` and granted to
  `service_role` only, so the publishable key cannot invoke them directly. The
  application server calls them through the server-only service client.
- **Internal operator tables are private**: RLS is enabled on
  `internal_operators` and `internal_access_audit` with no policies. Supabase
  default table privileges already include `service_role`, so the migration
  explicitly revokes `PUBLIC`, `anon`, `authenticated`, and `service_role` from
  both tables and then grants `service_role` `SELECT` only. Direct
  `INSERT`/`UPDATE`/`DELETE` by any client role, including `service_role`, is
  denied.
- **Internal operator functions are narrow and authenticated by grant**:
  `change_internal_operator_access(...)` (service-role-only) atomically changes
  the enabled mapping and appends the provision/revoke audit event; an invalid
  actor fails the audit FK after the mapping write and rolls the whole
  transaction back. `record_internal_operation_access(operator_user_id,
category)` is also service-role-only, accepts only the fixed
  `INTERNAL_ACCESS_VIEW` category, and rechecks the enabled mapping under
  `FOR SHARE`, which conflicts with the revocation `UPDATE`. Ordinary clients
  cannot execute either function, so there is no publishable-key write surface.
- **Audit is append-only**: audit writes occur only inside the
  `SECURITY DEFINER` owner functions; `service_role` has no direct
  mutation privilege, and Auth deletion nulls the direct user references on
  retained events through the FK `ON DELETE SET NULL`.
- **Durable public-operation abuse control**:
  `check_public_operation_rate_limit(...)` atomically increments one fixed
  window keyed by operation and a server-generated opaque HMAC actor digest.
  The allowed operations are `tracking_lookup`, `repair_request_submit`, and
  `feedback_submit` (issue #89, forward migration; existing rows are preserved).
  Its short-lived table stores no raw IP, Tracking Code, or customer data. Each
  later invocation deletes at most 100 expired rows. Expired rows are logically
  inactive immediately but may remain physically while there is no traffic;
  idle periods also create no new rows. Only `service_role` can execute the
  function or inspect retained state.
- All `SECURITY DEFINER` functions must explicitly set:
  ```sql
  SET search_path = public, pg_temp;
  ```
- Authenticated Provider profile updates use column-level grants. Provider type,
  slug, IDs, ownership, and timestamps are not client-editable.
- Provider/person-profile checks enforce durable text lengths and supported-device
  cardinality/element bounds; email/URL syntax and device de-duplication remain
  application validation responsibilities.
- Database triggers maintain `updated_at` for `providers`,
  `provider_user_profiles`, and `repairs`.
- The Repair Service Mode trigger is not a business-service surface: it repeats
  the Module invariant at write time for direct-client and concurrency safety.

### 5. Supabase CLI & State Hygiene

- `supabase/.temp/` is environment-specific CLI state and must **never** be committed (`.gitignore` enforced).
- No uncaptured manual changes made via the Supabase Dashboard.

---

## Deliberately Deferred Tables

Do not add without a validated requirement:

- `customers`, `devices`, `technicians`, `branches`, `inventory`, `parts`, `payments`, `invoices`, `appointments`, `ratings/reviews`.
- Internal access audit retention/purge windows, archive targets, and reporting
  projections: these need explicit owner approval (issue #87) and a retention
  policy decision before any table, job, or query surface is added.

Customer and device details remain point-in-time snapshots attached to a Repair or Repair Request.
