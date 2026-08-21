# 17 — Testing Strategy

## Testing philosophy

The feature Module interface is the primary business test surface. Test domain behavior through the same interfaces called by Next.js adapters.

## Feature/module tests

### Auth / Provider Access

- authenticated user resolves correctly;
- one-person Shop owner resolves as valid Provider context;
- Independent owner resolves as valid Provider context;
- Provider A membership cannot authorize Provider B data;
- required role checks reject unauthorized membership.

### Providers

- create/update `SHOP` and `INDEPENDENT` profiles;
- separate person profiles from authorization memberships;
- public address is optional where allowed;
- supported Service Modes are persisted correctly;
- `OTHER` mode details can be recorded;
- accepting Requests can be enabled/disabled;
- staff invitation creation, one-way SHA-256 token hashing, single-use acceptance, and revocation;
- public provider lookup by slug or ID queries `public_provider_profiles` projection only.

### Repair Requests

- public submission creates `SUBMITTED` Request;
- Request belongs only to selected Provider;
- accept creates exactly one Repair;
- repeated accept does not create duplicate Repair;
- decline creates no Repair;
- Provider can correct customer draft values on acceptance.

### Repairs

- direct creation records origin `PROVIDER_CREATED`;
- accepted Request records origin `CUSTOMER_REQUEST`;
- new Repair starts `IN_PROGRESS`;
- valid status transitions work;
- blocked/waiting states are optional;
- invalid transitions fail;
- status change appends Status Event;
- Customer Update can be added without status change;
- completion sets terminal state/timestamp.

### Tracking

- valid Tracking Code returns `PublicRepairView`;
- invalid code reveals no internal details;
- raw Repair/private fields cannot leak into output.

## Database / RLS integration tests

Run against real PostgreSQL/Supabase-compatible behavior for:

- membership uniqueness;
- person profile (`provider_user_profiles`) separation;
- Service Mode uniqueness;
- Request Reference uniqueness;
- Tracking Code uniqueness;
- `repair_request_id` one-to-one constraint;
- Staff invitation single-use, non-expired, and non-revoked constraints;
- Staff invitation restricted strictly to `SHOP` providers in database transaction;
- User cannot acquire a second active provider membership in MVP;
- Atomic provider + initial owner + person profile creation;
- Atomic staff invitation acceptance + person profile + membership creation;
- Provider RLS isolation (hostile cross-tenant queries denied);
- Public projection RLS (anonymous cannot query private columns of `providers`);
- child Status Event/Update access isolation.


## End-to-end tests with Playwright

### E2E 1 — Direct Repair

```text
Provider login
→ Create Repair
→ Repair starts IN_PROGRESS
→ Tracking Code generated
→ Customer tracks Repair
→ Provider adds update/status changes
→ READY
→ COMPLETED
```

### E2E 2 — Customer Request

```text
Customer opens Provider request page
→ submits Request
→ Provider reviews
→ verifies details
→ accepts
→ exactly one Repair created
→ tracking works
```

### E2E 3 — One-person Shop

A `SHOP` with one `OWNER` membership can perform the entire Provider workflow without separate technician/staff setup.

### E2E 4 — Independent Repairer

Independent Provider with Meetup/Home Service operates complete request/repair flow without a mandatory public shop address.

### E2E 5 — Cross-tenant attack

Provider A attempts direct URL/action access to Provider B Request and Repair and is denied by application rules and RLS.

## Docker consistency checks

CI and developers should run the same core commands available inside the container:

```text
npm run lint
npm run typecheck
npm test
npm run build
```

Keep `package-lock.json` committed to ensure dependency resolution consistency.
