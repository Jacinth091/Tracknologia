# Visual System

## Aesthetic Direction

Tracknologia should feel like a modern repair-operations product: technically credible, calm, organized, and approachable. Avoid both generic enterprise grayness and flashy consumer-tech styling.

Current component/design baseline:

- shadcn/ui
- Base UI
- Maia-inspired rounded direction
- Tailwind CSS design tokens

Use the installed project's actual theme variables as the source of truth. Do not hardcode palette values throughout components.

## Palette Direction

Use the approved **Hi-Vis on Paper** brand (the shipped "Workshop Hi-Vis"
direction): warm Paper, Ink, cream cards, and selective yellow action fills. The
canonical palette, supplied vector provenance, control styling, and rollout scope
are in
[UI and Information Architecture](../../../../docs/18_UI_INFORMATION_ARCHITECTURE.md#brand-foundation).
This replaces the earlier teal/cool-neutral recommendation.

Use semantic tokens from `src/app/globals.css`. Keep links and notices in the
foreground color; primary yellow is a fill, never text on Paper. Maintain the
existing `.dark` theme without adding a preference subsystem.

Ink is a surface as well as a text color. The landing hero and footer, the auth
brand panel, the tracking "not found" panel, and the solid ink secondary button
(`variant="secondary"`) all use `bg-foreground` with `text-background`.

## Radius and Depth

Use rounded corners consistently, not randomly.

- Controls (buttons, inputs, selects, filters): `rounded-lg` — 10px, the
  `--radius` token.
- Cards/dialogs: `rounded-xl` — 14px.
- Full rounding is reserved for badges (status and small labels) and avatars.
  Buttons, inputs, filters, and navigation are not pills.
- Cards use one `border-border` hairline plus one restrained shadow.
- Use the semantic radius classes and tokens; do not hardcode one-off radii.
- Avoid glassmorphism, excessive blur, neon glow, and gradient-heavy chrome.

## Typography

Prioritize legibility and operational scanning.

- Use the project's established sans family (Figtree) unless a deliberate brand
  typography decision is made. Headlines are heavier and tighter:
  `font-extrabold tracking-tight`.
- Use weight and size hierarchy before decorative type treatments.
- Dashboard titles should be clear but not oversized marketing headlines.
- Use tabular numerals for codes, counts, or timestamps.
- Ticket numbers, tracking codes, meta lines, and uppercase eyebrows use Geist
  Mono (`font-mono`); do not set body copy in mono.
- Use hugeicons (`@hugeicons/react` + `@hugeicons/core-free-icons`) for icons.
  Decorative icons set `aria-hidden="true"`.

## Layout

### Provider Dashboard

Desktop:

- compact 64px top header: wordmark, inline navigation with a yellow underline on
  the current section, Provider name/role, and an avatar account menu;
- content area with generous but efficient spacing;
- page title + one clear primary action;
- status stat tiles that link to the matching filtered list, followed by a
  "Needs attention" list built from existing queries;
- dense list rows rather than tall two-column cards;
- avoid dashboard-card overload.

Mobile:

- the header navigation moves into a Sheet opened from a menu button;
- stat tiles and dense rows stay tappable with larger control targets;
- summary information only when actionable;
- keep `Create Repair` easy to reach.

### Repair list

One bordered card containing dense rows. Each row is a single link:
`gauge · device/problem (bold) · Geist Mono meta line · status badge`. The whole
row is clickable. Keep status filters as link tabs with the yellow underline, not
pills.

### Public Tracking

Use a narrow centered content column. Render the result as one ticket card with
an 88px thick-ring gauge, a Geist Mono eyebrow carrying the tracking code, and
the status as the headline. The tracking result should emphasize:

1. Provider identity;
2. device identity;
3. current Repair status;
4. latest customer-visible update;
5. last updated time.

A "not found" lookup uses the ink panel and the dashed gauge. Do not expose
internal operational detail.

### Repair Request

Use a focused form width, grouped sections, and clear progress through the information. Avoid looking like an enterprise intake questionnaire.

## Status Presentation

Status is semantic, not decorative.

- `IN_PROGRESS`: blue informative treatment.
- `WAITING_FOR_PARTS`: rust waiting treatment.
- `AWAITING_APPROVAL`: purple attention treatment.
- `READY`: Ink on yellow; the most prominent status.
- `COMPLETED`: subdued warm-gray treatment.

Use the shared `.status-badge` styles with the existing status in `data-status`.
Keep the text label. Request SUBMITTED is blue, ACCEPTED is a green outline, and
DECLINED is red. Decorative brand charge is not measured repair progress.

Status badges (and avatars) may be fully rounded pills. The status gauge uses the
brand geometry: a thick ink ring with a solid yellow pie fill, not a thin
progress arc. Neither variant exposes progress-bar semantics.

## UI Anti-Patterns

Avoid:

- rainbow status palettes;
- multiple competing primary buttons;
- pill-shaped buttons, inputs, filters, or navigation;
- yellow text on Paper;
- raw hex/rgb colors inside components instead of semantic tokens;
- oversized empty dashboard metrics;
- gradients on every card;
- hardcoded one-off radii or shadows;
- giant marketing-style headings inside operational screens;
- dense desktop tables on mobile;
- decorative icons without `aria-hidden`;
- floating glass panels merely to look modern;
- rebuilding shadcn primitives without a concrete need.
