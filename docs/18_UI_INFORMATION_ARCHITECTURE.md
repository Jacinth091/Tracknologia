# 18 — UI and Information Architecture

## Brand foundation

The approved **Hi-Vis on Paper** identity replaces the previous cool-neutral/teal
direction. `src/app/globals.css` owns the light and `.dark` palettes:

| Role           | Light                                                         | Dark            |
| -------------- | ------------------------------------------------------------- | --------------- |
| Background     | Soft Paper `#FAF8F3` (brand Paper `#FBF6E9` is the reference) | Ink `#141414`   |
| Card           | `#FFFFFF`                                                     | `#1E1D1A`       |
| Text           | Ink `#141414`                                                 | Paper `#FBF6E9` |
| Muted text     | `#6B6455`                                                     | `#B5AC98`       |
| Primary action | Yellow `#FFC72C` with Ink text                                | Same            |

Use primary yellow for fills, with `primary-hover` and `primary-pressed` for
interaction. Yellow is never text on Paper: links, notices, and labels use
`text-foreground`. Controls use `border-input`; decorative dividers use
`border-border`. Focus indicators use the solid `ring` token. `.dark` supports the
brand palette without introducing a theme switch or preference storage.

Shape is deliberate. The base `--radius` token is 10px, so buttons, inputs,
selects, and filters use `rounded-lg` (10px) while cards and dialogs use
`rounded-xl` (14px). Full rounding is reserved for badges and avatars; controls
are not pills. Cards carry the warm `border-border` and one restrained shadow.

Ink works as a surface as well as a text color: the landing hero and footer, the
auth brand panel, the tracking "not found" panel, and the solid ink secondary
button (`variant="secondary"`, `bg-foreground` with `text-background`). Headings
use Figtree at heavier weights with tight tracking (`font-extrabold
tracking-tight`). Ticket numbers, codes, meta lines, and uppercase eyebrows use
Geist Mono (`font-mono`).

Icons come from hugeicons (`@hugeicons/react` with
`@hugeicons/core-free-icons`). Decorative icons set `aria-hidden="true"` and
never carry meaning that adjacent text lacks.

`src/components/shared/brand-logo.tsx` contains the supplied vector wordmark from
`Logo — the charge gauge (final)-html/assets/543f8337850166bf39ba3059bbce9268.svg`.
It preserves the original path geometry, inherits the theme's foreground, and
uses a transparent gauge interior so it sits on both Paper and Card surfaces.
The default height is 26px; never render the wordmark below 18px. Use the standalone
mark at smaller sizes. Print uses a one-color wordmark. The SVG has one accessible
name, **Tracknologia**; its decorative charge is not repair progress.

`src/app/icon.svg` preserves the supplied heavier-ring small icon
(`143b7064aaf47681e242da1af8ac6370.svg`); `favicon.ico` contains 16px and 32px
renders of it. Next.js discovers both through its file-based metadata convention.

Request and Repair badges share `.status-badge` with their existing status in
`data-status`. The stylesheet owns the colors for both themes: submitted is blue,
accepted is a green outline, declined is red, in progress is blue, waiting for
parts is rust, awaiting approval is purple, READY is Ink on yellow, and completed
is warm gray. Always retain the text label. Public tracking still resolves an
accepted Request to its Repair; ACCEPTED remains a Provider Request status.

`src/components/shared/status-gauge.tsx` illustrates the existing named states:
SUBMITTED has a 15% fill, ACCEPTED 30%, IN_PROGRESS and both waiting states 50%,
READY 85%, and COMPLETED 100%. These are artwork proportions, never measured
completion or displayed percentages. The geometry matches the brand: a thick ink
ring with a solid yellow pie fill, not a thin progress arc. DECLINED uses a
faded empty ring with a slash; a missing lookup result uses a separate dashed
empty ring. Adjacent text names the state and the gauge is decorative. A
standalone gauge requires its human-readable `label`. Neither variant exposes
progress-bar semantics.

Waiting states hold their fill and pulse gently only when the user has no
reduced-motion preference. Gauges use already-fetched status fields; they do not
poll or imply live updates. Compact gauges appear in Provider lists; larger
gauges appear in details, public tracking, and submitted Request receipts.

The identity covers landing, auth, onboarding, public request/tracking, and the
Provider workspace. The Provider workspace uses a compact 64px header: wordmark,
inline desktop navigation (Dashboard, Requests, Repairs, Shop-only Team & Staff,
Settings) with a yellow underline on the current section — including detail
routes — the Provider name and role, and an avatar account menu containing
Settings and Sign Out. On phones the links move into a Sheet opened from a menu
button; both surfaces render the same role-gated link list and mark the active
item with `aria-current="page"`. Shared inputs and primary actions have larger
phone targets; long device names and reference codes wrap. Native account-role
radios support keyboard selection.

## Public customer area

### Tracknologia landing

Keep the MVP customer surface small.

Primary action:

- **Track Repair**

Repair Requests may primarily be entered through Provider-specific links rather than a global marketplace.

### Provider-specific request page

```text
Provider identity
Supported Service Modes

Customer Details
Device Details
Reported Problem
Preferred Service Mode
Review
Submit
```

### Track Repair

```text
Tracking Code input
↓
Public Repair View
```

Public view should emphasize:

- Provider
- Device
- Status
- Customer Update
- Last Updated
- Service-mode-appropriate handover wording when READY

The implemented `/track` surface uses a narrow mobile-first column and a
POST-backed form. Success renders one ticket card with an 88px gauge, a Geist
Mono eyebrow (`CUSTOMER TRACKING · TRK-…`), and the status as the headline —
READY is highlighted with the status badge. It keeps status visible by text as
well as color, highlights the latest Customer Update, collapses earlier Updates,
and labels Service Mode without exposing free-form arrangement details. Malformed
and unknown codes share the same neutral result.

The not-found result uses an ink panel with the dashed gauge; service/rate-limit
failures show unavailable guidance without assigning a status. Pending lookups
hide the prior result. Request receipts identify a Request Reference, not a Repair credential.
Only valid `REQ-` references can prefill from a URL; `TRK-` credentials remain in
the POST-backed form. Status descriptions and Service Mode handover wording
continue to come from the Tracking feature.

## Authenticated Provider area

### Dashboard

Four stat tiles — Active, Waiting, Ready, and Completed — each carry a hugeicons
icon and status accent and link to the matching filtered Repair list. `Create
Repair` is the single primary action.

Below the tiles, **Needs attention** groups `READY` repairs (ready for handover),
`AWAITING_APPROVAL` repairs, and `SUBMITTED` Repair Requests, capped at five rows
and built from the existing list queries. Each group links to its filtered list,
and an Empty state appears when nothing is pending.

The Waiting tile links to an aggregate Repair view containing both
`WAITING_FOR_PARTS` and `AWAITING_APPROVAL`, matching the displayed count.

Do not force shop-only widgets such as branch/staff workload onto Independent Repairers.

### Repair list item

Repairs and Requests use one dense bordered list. Each row is a single link:

```text
[gauge]  Lenovo IdeaPad 3 · Battery issue        [IN_PROGRESS]
         TN-2026-00125 · Juan Dela Cruz · Updated 10:32
```

Device and reported problem stay bold; the meta line is Geist Mono. Rows keep
larger phone targets. Status filters preserve the current search query (`q`) and
mark the active filter with the yellow underline.

Repair search accepts common customer/device punctuation. Invalid bounded input
is preserved in the field and receives an inline validation message rather than
silently opening the unfiltered list.

### Repair detail editing

If the Repair's recorded Service Mode is no longer configured, keep it visible
and selected in the edit form with a clear "recorded on this Repair; no longer
offered" note. The Provider User may preserve it or intentionally choose no
mode/currently offered mode; the UI must not erase it during an unrelated edit.

### Repair Request review

Display customer-submitted information clearly as **reported** information.

Actions:

- Accept & Create Repair
- Decline Request

### Accept & Create Repair

Pre-fill request information but allow Provider verification/correction.

Separate:

- Customer/Device data
- Reported Problem
- Provider intake observations
- private technical fields

### Direct Create Repair

Use the same final Repair-input model without a Request prerequisite.

## Device input design

### Device Type

Controlled list with `Other`.

Initial candidate list:

- Phone
- Tablet
- Laptop
- Desktop Computer
- Monitor
- Television
- Printer
- Game Console
- Smartwatch / Wearable
- Camera
- Audio Device
- Other

### Customer-entered technical depth

Keep Brand/Model optional or recommended, with deeper fields optional.

### Provider-entered intake depth

May include:

- Serial / IMEI
- Color / Variant
- Device Specifications
- Physical Condition
- Accessories Received
- Initial Observation

Do not require every field if that would slow normal repair intake.
