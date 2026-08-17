# Tracknologia Domain Context

This file is the canonical Tracknologia glossary. It intentionally contains **domain meanings only** and excludes technology, database, framework, and implementation details.

## Repair Provider

A person or business that accepts and performs electronics repair work using Tracknologia.

A Repair Provider is one of:

- **Repair Shop**
- **Independent Repairer**

Both are first-class Provider types and share the same core Repair workflow.

## Repair Shop

A Repair Provider operating as a repair business or shop. A Repair Shop may be operated by a single owner-technician or by multiple Provider Users. Tracknologia does not assume that every shop has separate staff or technicians.

## Independent Repairer

A Repair Provider operating independently rather than as a traditional repair shop.

An Independent Repairer may work through drop-off, meetup, home-service, or another agreed arrangement and is not required to expose a private residential address.

## Provider User

A human who is authorized to act on behalf of a Repair Provider in Tracknologia.

A Provider User is not the same thing as a Repair Provider. The same person may be both the owner and the technician for a one-person Provider.

## Customer

A person seeking or receiving repair work for a device.

A Customer does not require a Tracknologia account to submit a permitted Repair Request or track an accepted Repair.

## Repair Request

Customer-submitted information describing a device and repair problem for one specific Repair Provider to review.

A Repair Request is **not yet an accepted Repair**.

A Repair Request may be accepted or declined by its Provider.

## Repair

An accepted device-repair job managed through Tracknologia.

A Repair may originate from:

- an accepted Repair Request; or
- direct creation by a Provider User.

Once created, both origins use the same Repair lifecycle.

## Reported Problem

The problem or symptoms described by the Customer.

A Reported Problem is not a Diagnosis.

## Diagnosis

The Provider's technical assessment of the device problem.

## Device Snapshot

The device information captured for one Repair at intake, such as device type, brand, model, identifier, specifications, physical condition, and accessories.

A Device Snapshot belongs to a Repair and does not imply that Tracknologia maintains a permanent device inventory or customer device registry.

## Service Area

The geographic area in which a Repair Provider offers repair services.

Service Area is particularly important for Independent Repairers and does not require publishing a private home address.

## Service Mode

The arrangement through which a Provider receives or performs repair work.

Baseline Service Modes are:

- **Drop-off** — the device is brought to an agreed Provider location.
- **Meetup** — Customer and Provider arrange a meeting or handover location.
- **Home Service** — the Provider performs or receives the work through a customer-location arrangement.
- **Other** — another Provider-defined arrangement.

A Provider may support multiple Service Modes. One Repair or Repair Request may identify one selected/preferred Service Mode.

## Ticket Number

A human-readable reference assigned to an accepted Repair.

## Tracking Code

A customer-facing credential used to retrieve the public tracking view of an accepted Repair.

## Repair Status

A meaningful operational state of an accepted Repair.

Current working statuses are:

- **In Progress** — active work is proceeding.
- **Waiting for Parts** — the Repair remains active but cannot continue until a required part/material is available.
- **Awaiting Approval** — the Repair remains active but cannot continue until the Customer approves proceeding.
- **Ready** — the Provider has finished the current repair work and the device is ready for return/handover according to the selected Service Mode.
- **Completed** — the Repair lifecycle and return/handover are finished.

Waiting for Parts and Awaiting Approval are optional branches, not mandatory sequential stages.

## Status Event

A recorded change in Repair Status.

## Internal Note

Provider-private information related to a Repair that must not appear in the Customer's public tracking view.

## Customer Update

Provider-authored repair information that is safe and intended to be shown to the Customer. A Repair may have multiple Customer Updates without changing Repair Status.

## Request Reference

A reference assigned to a Repair Request before an official Repair exists.

A Request Reference is not a Ticket Number or Tracking Code.
