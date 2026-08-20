# Feature — Providers

**Code location:** `src/features/providers/`

## Description

The Providers feature represents the **repair business identity, staff invitations, and operating configuration** in Tracknologia.

A Provider is either:

- `SHOP`; or
- `INDEPENDENT`.

Both are first-class Provider types that use the same core Repair system.

## Primary goal

Give Tracknologia a provider-centric business identity that works equally well for a traditional Repair Shop and an Independent Repairer without forcing either into the other's operating model, while governing secure Staff onboarding.

## Feature goals

- Create and maintain Provider business/profile information.
- Atomic onboarding for Independent Repairers and Shop Owners.
- Secure, Owner-authorized invitation flow for Shop Staff (`provider_invitations`).
- Preserve `SHOP` and `INDEPENDENT` as equal supported Provider types.
- Support one-person shops as naturally as multi-user shops.
- Allow Independent Repairers to operate without publishing a private home address.
- Store Service Area and supported device categories without premature location/device normalization.
- Configure multiple supported Service Modes.
- Provide a public Provider profile by slug for provider-specific customer Request pages.
- Control whether the Provider is currently accepting customer Repair Requests.

## Non-goals

The MVP Providers feature does not include:

- global provider marketplace/discovery;
- Google Maps/Places integration;
- nearest-provider routing;
- branches;
- staff workload scheduling;
- reviews/ratings;
- promoted listings;
- a permanent supported-device catalog hierarchy.

## Main actors

- **Provider Owner** — creates Provider, manages configuration, and invites Shop Staff.
- **Shop Staff** — joins an existing Shop via an Owner-authorized invitation.
- **Customer** — may view limited public Provider identity/configuration on a Provider-specific Request page.

## Owned data

### `providers`

Key information includes:

- Provider type (`SHOP` | `INDEPENDENT`);
- display name;
- slug;
- description/profile image;
- contact information;
- optional public address;
- Service Area;
- supported device categories;
- `accepting_requests`;
- timestamps.

### `provider_memberships`

Associates an authenticated user with a Provider as `OWNER` or `STAFF`.

### `provider_invitations`

Owner-authorized, expiring, single-use, token-hashed invitations for Shop Staff onboarding:

```text
id
provider_id
email
role (STAFF)
token_hash
invited_by_user_id
created_at
expires_at
accepted_at
accepted_by_user_id
revoked_at
```

### `provider_service_modes`

Repeating relation of supported modes:

```text
DROP_OFF
MEETUP
HOME_SERVICE
OTHER
```

## Public Interface (`src/features/providers/index.ts`)

```ts
createProviderWithOwner(params: CreateProviderInput): Promise<{ providerId: string; membershipId: string; slug: string }>
acceptStaffInvitation(tokenHash: string): Promise<{ providerId: string; membershipId: string; role: "STAFF" }>
getProviderById(providerId: string): Promise<Provider | null>
getPublicProviderBySlug(slug: string): Promise<PublicProviderProfile | null>
updateProviderProfile(context: ProviderContext, input: UpdateProviderInput): Promise<Provider>
createStaffInvitation(context: ProviderContext, email: string): Promise<ProviderInvitation>
revokeStaffInvitation(context: ProviderContext, invitationId: string): Promise<void>
setServiceModes(context: ProviderContext, modes: ProviderServiceMode[]): Promise<ProviderServiceMode[]>
```

## Core workflows

### 1. Independent Repairer / Shop Owner Onboarding (LD-01)
```text
Authenticated User
       ↓
createProviderWithOwner({ displayName, providerType })
       ↓ (atomic database transaction)
INSERT providers + INSERT provider_memberships (role: OWNER)
```

### 2. Shop Staff Onboarding (LD-01)
```text
Shop Owner creates Staff invitation (persists token_hash)
       ↓
Staff clicks email invite link with token
       ↓
Staff registers or signs in
       ↓
acceptStaffInvitation(tokenHash)
       ↓ (atomic database transaction)
Validate token_hash, not expired, not revoked, not accepted
       ↓
INSERT provider_memberships (role: STAFF) + UPDATE accepted_at = now()
```

## Important invariants

1. Every Provider has exactly one type: `SHOP` or `INDEPENDENT`.
2. Provider type does not change the core Repair lifecycle.
3. A Shop may have one owner-user only.
4. Independent Repairers are not required to publish a residential address.
5. Shop Staff cannot search for, discover, or self-join a Provider without an Owner invitation.
6. Public Provider information must be intentionally selected, not a raw database row.
7. Provider slugs are unique.

## Testing expectations

Test:
- atomic Independent provider + owner creation;
- atomic Shop provider + owner creation;
- valid Staff invitation creates exactly one `STAFF` membership atomically;
- expired, revoked, or consumed invitations are rejected;
- Staff cannot join a Provider without a valid invitation;
- public lookup by slug returns only public-safe fields;
- cross-Provider update denial.
