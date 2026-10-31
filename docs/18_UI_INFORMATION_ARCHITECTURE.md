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

On phones, auth content starts near the top with compact page padding instead of
centering the whole form vertically. The desktop two-column auth layout retains
its centered form and brand panel.

The identity covers landing, auth, onboarding, public request/tracking/feedback,
and the Provider workspace. The Provider workspace uses a compact 64px header:
wordmark, inline desktop navigation (Dashboard, Requests, Repairs, Shop-only
Team & Staff, Feedback, Settings) with a yellow underline on the current section — including detail
routes — the Provider name and role, and an avatar account menu containing
Settings and Sign Out. On phones the links move into a Sheet opened from a menu
button; both surfaces render the same role-gated link list and mark the active
item with `aria-current="page"`. Shared inputs and primary actions have larger
phone targets; long device names and reference codes wrap. Native account-role
radios support keyboard selection.

## Provider onboarding

Onboarding follows the account type chosen at registration: Independent, Shop
Owner, or Shop Staff. An invitation opens the Staff flow. The account-type chooser
is reserved for accounts with no recorded signup type; a Staff account without its
invite token stays in the Staff flow and can enter its code.

Staff enter a manual invitation code only on onboarding, after creating their
account. Registration collects email and password and uses Create account for
every account type. A shared invitation link still carries its code automatically
into onboarding without a second prompt.

The setup page has one heading and a compact brand header with Sign out. Owner
forms group personal details, the public business profile, and services, with
section labels beside the fields on desktop and above them on phones. Optional
public contact and location fields use expandable sections that open when their
validation fails. Other arrangement details appear when that Service Mode is
selected. Staff see their shop invitation and personal fields. Setup keeps the
existing feature operations, required fields, and authorization checks.

## Public customer area

Unavailable public Repair Request links use a branded recovery panel with neutral
wording for a missing Provider or one not accepting requests. It offers tracking
and home links without exposing private Provider details. The root `not-found`
page uses the same visual treatment with a 404 illustration and recovery links;
it renders without authentication or cookie reads.

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

## Internal validation metrics

The metrics page separates its title/Refresh action from a responsive period
filter panel. Period and generation details sit below the controls; snapshot,
retention, and coverage notes are available under Data coverage & retention.
Charts follow Providers & activity, Requests & repairs, Customer tracking, and
Feedback, combining related measurements rather than one mixed card grid.
Current-state, period, and all-time labels and chart values retain their existing
meanings. All numbers expands into seven named groups with aligned labels and
values, two columns on desktop and one on phones. Requests precede Repairs, and
scope guidance explains period, current snapshot, and unavailable calculations.

Clear filters on metrics returns to the default seven-day view and removes custom
dates. Graphs use foreground Ink for the primary series and neutral gray for the
second categorical series; dark mode uses its foreground equivalent. Bars and
arcs have clear boundaries, and donut values sit outside their slices.

The internal Overview uses compact headline tiles and a short activity empty
state, with direct links to feedback review and full metrics. Feedback Inbox uses
the same header scale, a grouped filter form with Clear filters, and a submission
list whose source, participant class, timestamp, status, and privacy/priority flags
wrap independently on phones. Counts describe only the loaded page, not a global
inbox total. Operator audit and feedback privacy notes remain visible as supporting
text.

Feedback review places the read-only participant submission beside Review &
triage on desktop, stacking them in that order on phones. Original wording wraps
within its panel; status and priority badges summarize the current review, with
chronological status history below. Privacy warnings, validation, and stale-review
protection remain in place.

The internal header follows the Provider workspace pattern: inline desktop
navigation, a phone navigation drawer that closes on selection, and an account
dropdown containing Privacy notice and Sign Out. It identifies this workspace as
Internal operations / Operator without displaying a Provider identity.

## Authenticated Provider area

Provider overview, lists, team, and feedback pages use direct page headings
without repeated section eyebrows. The heading remains the primary wayfinding
label; other surfaces can retain their contextual labels.

### Settings

Settings uses a vertical tab menu beside a shared content column on desktop,
and a horizontal tab row above the content on smaller screens. Tab orientation
and keyboard navigation follow the displayed layout. Profile, Business,
Account, and Service modes panels use the same available width. The Business
form groups identity, contact/location, and services, and labels its email
field Customer Contact Email to mark it as the Provider's public contact
channel; Other arrangement details appear when that mode is selected. The
Account & Security panel shows the person's read-only sign-in email (the
password-recovery destination) with a link to password recovery, and Staff
keep access to it alongside their own profile, with Provider configuration
restricted to Owners.

Settings and onboarding use the same Supported devices checkboxes. Settings
preselects saved categories, including any existing custom labels, and saves all
checked values. Unchecking every category clears the list. The request-acceptance
switch is controlled so saving and revalidation do not change an uncontrolled
Switch default.

### Dashboard

Four stat tiles — Active, Waiting, Ready, and Completed — each carry a hugeicons
icon and status accent and link to the matching filtered Repair list. `Create
Repair` is the single primary action.

The tiles use compact horizontal icon/count groups. The shared request-link
panel keeps the full selectable URL, Copy/Open controls, acceptance badge, and
Settings link together with wrapping appropriate to sidebars and phone screens.

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
[gauge]  Lenovo IdeaPad 3                       [IN_PROGRESS]
         Battery issue
         TN-2026-00125 · Juan Dela Cruz · Updated 10:32
```

Device identity is emphasized separately from the reported problem, and each
can wrap to two lines. Codes retain Geist Mono; customer and timestamp metadata
wrap independently in the body typeface. Status badges stay visible, with
keyboard focus on the full row. Pagination controls and status filters keep
phone-sized targets. Status filters preserve the current search query (`q`) and
mark the active filter with the yellow underline.

### Team and feedback

The invitation form uses a visible Staff Email label and a full-width action,
avoiding a squeezed field/button row in the desktop sidebar. Member names and
roles wrap, and dates use readable body text. Generated invitation codes wrap
within their panel. Existing recipient, expiry, and removal rules still apply.

Provider feedback uses a centered form column. The shared public/Provider form
has one defined surface, clear category selection, a grouped send/privacy row,
and a separated privacy disclosure. Approved notice wording, retry handling,
and personal-details warnings are unchanged.

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

While a Request is `SUBMITTED`, show everything the customer sent (customer and
device details, Reported Problem, and the Request-only context such as when it
started) **read-only**, once. The Provider's decision is the only input:

- Service Mode and arrangement details
- private Internal Notes

The Repair snapshot is built server-side from the stored Request, so
browser-submitted customer or device values are never used. Customer and device
details, intake observations and Diagnosis are corrected or added afterwards on
the resulting Repair ("Edit Repair details").

### Direct Create Repair

Use the same final Repair-input model without a Request prerequisite. Here the
Provider enters and can edit every intake field, because there is no
customer-submitted Request.

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
