# 01 — Product Context

## Product

**Tracknologia** is a lightweight electronics-repair lifecycle platform for **Repair Shops** and **Independent Repairers**, with customer-facing repair request and tracking capabilities.

## Core product promise

For Providers:

> Record and manage repair work without requiring a heavyweight repair-business suite.

For Customers:

> Describe a device problem when useful and track an accepted repair without creating an account.

## Provider-centric framing

Tracknologia must not behave like shop software with a freelancer checkbox.

The shared core is organized around the generic **Repair Provider** concept:

```text
Repair Provider
├── Repair Shop
└── Independent Repairer
```

Both Provider types can:

- receive Repair Requests;
- create Repairs directly;
- record device/customer intake;
- maintain Repair status;
- add Diagnosis and notes;
- provide Customer Updates;
- issue tracking information;
- complete Repairs.

Provider-type-specific functionality should exist only where operating models genuinely differ.

## Two valid intake paths

### Path A — Customer Repair Request

```text
Customer
  ↓
Provider-specific Repair Request form
  ↓
SUBMITTED
  ↓
Provider review
  ↓
Accept + verify
  ↓
Repair
```

### Path B — Provider Direct Creation

```text
Walk-in / meetup / home-service / verbal intake
  ↓
Provider User creates Repair directly
  ↓
Repair
```

After the Repair exists, both paths converge.

## Customer account policy

Customer accounts are not part of the MVP.

Customers should be able to:

- submit a permitted provider-specific Repair Request; and
- track an accepted Repair using its tracking credential.

## Scope boundary

Tracknologia starts as a repair-lifecycle product, not an all-in-one repair-business operating system.

The MVP intentionally does not attempt to solve:

- accounting;
- payroll;
- full inventory;
- point of sale;
- e-commerce;
- AI diagnosis;
- provider marketplace bidding;
- general maps-based repair discovery.

## Future expansion principle

Additional features must be justified by pilot evidence, repeated user need, or a validated business-model requirement.
