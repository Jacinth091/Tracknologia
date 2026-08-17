# 04 — User Roles and Provider Types

## Actor model

```text
Provider User ──acts for──> Repair Provider
Customer ───────submits───> Repair Request
Customer ───────tracks────> Repair
```

## Repair Provider

The business-side domain entity. A Provider is either `SHOP` or `INDEPENDENT`.

### Repair Shop

A shop can be a one-person operation. The owner may also be the only technician and the only authenticated Provider User.

Valid MVP example:

```text
ABC Repair Shop
└── Juan — OWNER and working technician
```

Tracknologia must not require a separate technician/staff record just because a Provider is a Shop.

A larger Shop can later have multiple Provider Users through the same membership model.

### Independent Repairer

An Independent Repairer is equally first-class and is not modeled as an incomplete Shop.

Typical profile information includes:

- display/service name;
- public contact information;
- Service Area;
- supported device categories;
- Service Modes;
- optional public address.

A private residential address is never required for public display.

## Provider User

An authenticated person operating Tracknologia for a Provider.

MVP membership roles:

- `OWNER`
- `STAFF`

A one-person Shop or Independent Provider normally has one `OWNER` membership only.

## Customer

A non-authenticated external participant.

Customer capabilities:

- open a Provider-specific Repair Request form;
- submit device/problem information;
- choose a preferred Service Mode;
- track an accepted Repair using its Tracking Code.

Customer restrictions:

- cannot create an authoritative Repair directly;
- cannot set Repair Status;
- cannot provide the authoritative Diagnosis;
- cannot see Internal Notes or Provider-private data;
- cannot see unrelated Requests/Repairs.

## Equal-first-class rule

Shared interfaces should use neutral labels such as:

- Provider Dashboard
- Provider Profile
- Repair Provider
- Provider User

Use "Shop" only when behavior is truly specific to `SHOP` Providers.
