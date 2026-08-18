# Feature — Providers

**Code location:** `src/features/providers/`

## Description

The Providers feature represents the **repair business identity and operating configuration** in Tracknologia.

A Provider is either:

- `SHOP`; or
- `INDEPENDENT`.

Both are first-class Provider types that use the same core Repair system.

## Primary goal

Give Tracknologia a provider-centric business identity that works equally well for a traditional Repair Shop and an Independent Repairer without forcing either into the other's operating model.

## Feature goals

- Create and maintain Provider business/profile information.
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

- **Provider User** — manages Provider configuration.
- **Customer** — may view limited public Provider identity/configuration on a Provider-specific Request page.

## Owned data

### `providers`

Key information includes:

- Provider type;
- display name;
- slug;
- description/profile image;
- contact information;
- optional public address;
- Service Area;
- supported device categories;
- `accepting_requests`;
- timestamps.

### `provider_service_modes`

Repeating relation of supported modes:

```text
DROP_OFF
MEETUP
HOME_SERVICE
OTHER
```

`OTHER` may include Provider-defined details.

## Conceptual Interface

```ts
createProvider(input): Provider
getProvider(providerId): Provider
getPublicProviderBySlug(slug): PublicProviderProfile
updateProviderProfile(context, input): Provider
setServiceModes(context, modes): ProviderServiceMode[]
```

Public and private Provider views should not expose the same fields by accident.

## Core workflow — Provider configuration

```text
Provider User
   ↓ Auth / ProviderContext
Open Settings
   ↓
Edit Provider profile
   ↓
Validate business/profile fields
   ↓
Update Provider-owned configuration
```

## Core workflow — Service Modes

```text
Provider Settings
    ↓
Select one or more supported modes
    ↓
DROP_OFF / MEETUP / HOME_SERVICE / OTHER
    ↓
Persist supported modes
    ↓
Public Repair Request page can present those modes
```

A supported mode describes what the Provider offers. A particular Repair Request/Repair may select only one preferred/selected mode.

## Routes and UI

Protected configuration:

```text
/dashboard/settings
```

Potential Provider UI sections:

- profile identity;
- Provider type;
- contact information;
- Service Area;
- optional public address;
- supported device categories;
- supported Service Modes;
- accepting Requests toggle.

Public Provider identity appears primarily on:

```text
/p/[providerSlug]/request
```

## Relationships with other features

### Auth

Protected Provider writes require trusted `ProviderContext`.

### Repair Requests

Repair Requests depends on Providers to determine:

- target Provider by slug;
- whether the Provider accepts Requests;
- public Provider identity;
- supported Service Modes.

### Repairs

Every Repair belongs to exactly one Provider. Repair ownership must be derived from trusted Provider context on protected operations.

### Tracking

Public Tracking may display Provider display name and intentionally public profile information.

## Important invariants

1. Every Provider has exactly one type: `SHOP` or `INDEPENDENT`.
2. Provider type does not change the core Repair lifecycle.
3. A Shop may have one owner-user only.
4. Independent Repairers are not required to publish a residential address.
5. A Provider may support multiple Service Modes.
6. Public Provider information must be intentionally selected, not a raw database row.
7. Provider slugs are unique.

## Important scenarios

### Independent Repairer

```text
Type: INDEPENDENT
Public address: null
Service Area: Cebu City
Modes: MEETUP, HOME_SERVICE
```

Valid configuration.

### One-person Shop

```text
Type: SHOP
Public address: shop location
Memberships: owner only
```

Also valid. No Staff/Technician requirement exists.

## Validation expectations

- slug format and uniqueness;
- Provider type enum;
- contact fields;
- supported Service Mode enum values;
- reasonable Service Area/public-address lengths;
- public fields sanitized/validated before rendering.

## Security expectations

- only authorized Provider Users may modify their Provider;
- Provider A cannot update Provider B;
- public Provider lookup exposes only public-safe fields;
- RLS should enforce Provider ownership where applicable.

## Testing expectations

Test:

- create/update Provider;
- public lookup by valid/invalid slug;
- independent with null public address;
- shop with one owner only;
- multiple Service Modes;
- `accepting_requests = false` behavior;
- cross-Provider update denial.

## Definition of done

The feature is healthy when both Shops and Independent Repairers can accurately represent how they operate, and other features can consume that configuration without embedding shop-specific assumptions.
