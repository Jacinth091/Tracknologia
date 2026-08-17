# 06 — Per-User System Flows

## Customer — Submit Repair Request

```text
Open Provider Request Link
        ↓
View Provider Name / Supported Service Modes
        ↓
Enter Name + Contact
        ↓
Select Device Type
        ↓
Enter optional Brand / Model / Identifier / Details
        ↓
Describe Reported Problem
        ↓
Choose preferred Service Mode
        ↓
Review Submission
        ↓
Submit
        ↓
Receive Request Reference
```

## Customer — Track Repair

```text
Open Track Repair
        ↓
Enter Tracking Code
        ↓
System validates credential
        ↓
View customer-safe Repair information
        ↓
See Status + Customer Update + Last Updated
```

## Provider User — Review Repair Request

```text
Login
  ↓
Provider Dashboard
  ↓
Repair Requests
  ↓
Open Request
  ↓
Review Customer + Device + Problem + Service Mode
  ↓
Accept & Create Repair OR Decline
```

## Provider User — Accept Repair Request

```text
Open SUBMITTED Request
        ↓
Accept & Create Repair
        ↓
Verify / correct customer-supplied data
        ↓
Add Provider-only intake details
        ↓
Confirm
        ↓
Repair created
        ↓
Ticket + Tracking Code generated
        ↓
Status = IN_PROGRESS
```

## Provider User — Direct Create Repair

```text
Login
  ↓
Create Repair
  ↓
Enter Customer information
  ↓
Enter Device Snapshot
  ↓
Enter Reported Problem
  ↓
Add intake observations if known
  ↓
Create
  ↓
Ticket + Tracking Code generated
  ↓
Status = IN_PROGRESS
```

## Provider User — Update active Repair

```text
Open Repair
  ↓
Record Diagnosis / Internal Note / Customer Update as needed
  ↓
If blocked by part: WAITING_FOR_PARTS
If blocked by customer approval: AWAITING_APPROVAL
If resumed: IN_PROGRESS
If work finished: READY
  ↓
Status Event recorded
```

## Provider User — Complete Repair

```text
Repair = READY
  ↓
Return / handover completed
  ↓
Mark COMPLETED
  ↓
Status Event recorded
  ↓
Move to Completed Repairs
```
