# Database Design & Migration Rules

Tracknologia uses PostgreSQL managed through Supabase.

The MVP intentionally favors a small schema with sufficiently rich rows rather than premature normalization.

---

## Core Application Tables

```text
providers
provider_memberships
provider_invitations
provider_service_modes
repair_requests
repairs
repair_status_events
repair_updates
```

Authentication identities live in Supabase-managed `auth.users`.

A `tracking_events` table may be added for pilot analytics when required.

---

## Relationships

```text
auth.users
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
    │                                     └──< repair_updates
```

---

## Table Definitions

### 1. `providers`
Represents both Repair Shops and Independent Repairers.
- `id` (uuid, PK)
- `provider_type` (`SHOP` | `INDEPENDENT`)
- `display_name` (text)
- `slug` (text, UNIQUE)
- `description`, `profile_image_url`, `contact_phone`, `contact_email`
- `public_address` (nullable for Independent Repairers)
- `service_area` (nullable)
- `supported_devices` (text array)
- `accepting_requests` (boolean, default true)
- `created_at`, `updated_at` (timestamptz)

### 2. `provider_memberships`
Connects `auth.users` to Providers.
- `id` (uuid, PK)
- `provider_id` (uuid, FK $\to$ `providers.id`)
- `user_id` (uuid, FK $\to$ `auth.users.id`)
- `role` (`OWNER` | `STAFF`)
- `created_at` (timestamptz)
- `CONSTRAINT unique_provider_user UNIQUE(provider_id, user_id)`

### 3. `provider_invitations`
Governs secure, Owner-authorized Staff onboarding (LD-01).
- `id` (uuid, PK)
- `provider_id` (uuid, FK $\to$ `providers.id`)
- `email` (text)
- `role` (`STAFF`)
- `token_hash` (text, UNIQUE)
- `invited_by_user_id` (uuid, FK $\to$ `auth.users.id`)
- `created_at`, `expires_at` (7 days default), `accepted_at`, `accepted_by_user_id`, `revoked_at`

### 4. `provider_service_modes`
Repeating relation of supported modes (`DROP_OFF`, `MEETUP`, `HOME_SERVICE`, `OTHER`).
- `PRIMARY KEY(provider_id, mode)`

### 5. `repair_requests`
Customer-submitted intake awaiting Provider decision (`SUBMITTED`, `ACCEPTED`, `DECLINED`). Not an authoritative Repair.

### 6. `repairs`
The authoritative repair record containing customer and device snapshots.
- `repair_request_id` is nullable and unique so one Repair Request can create at most one Repair.
- Lifecycle: `IN_PROGRESS`, `WAITING_FOR_PARTS`, `AWAITING_APPROVAL`, `READY`, `COMPLETED`.

### 7. `repair_status_events` & `repair_updates`
- `repair_status_events`: Audit log of lifecycle transitions.
- `repair_updates`: Customer-visible progress messages independent of status changes.

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
*Good*: `20260820000001_create_provider_identity.sql`  
*Avoid*: `fix.sql`, `temp_workaround.sql`, `fix_rls_again.sql`

### 3. Fresh-Database Reproducibility
Every migration chain must apply cleanly from an empty database to full schema, RLS, and functions without manual interventions or dashboard-only patches:
```bash
npx supabase db push
```

### 4. Row Level Security & Least Privilege
- **Mandatory RLS**: Enabled on all provider-owned tables (`providers`, `provider_memberships`, `provider_invitations`, `repairs`, etc.).
- **Prohibited Client Self-Assignment**: Direct client `INSERT` on `provider_memberships` is strictly forbidden.
- **Atomic SECURITY DEFINER Procedures**:
  - `create_provider_with_owner(display_name, provider_type)`: Transactionally provisions new Provider and links caller as `OWNER`.
  - `accept_staff_invitation(token_hash)`: Transactionally validates invite, creates `STAFF` membership, and marks token accepted.
- All `SECURITY DEFINER` functions must explicitly set:
  ```sql
  SET search_path = public, pg_temp;
  ```

### 5. Supabase CLI & State Hygiene
- `supabase/.temp/` is environment-specific CLI state and must **never** be committed (`.gitignore` enforced).
- No uncaptured manual changes made via the Supabase Dashboard.

---

## Deliberately Deferred Tables

Do not add without a validated requirement:
- `customers`, `devices`, `technicians`, `branches`, `inventory`, `parts`, `payments`, `invoices`, `appointments`, `ratings/reviews`.

Customer and device details remain point-in-time snapshots attached to a Repair or Repair Request.
