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

Use the approved **Hi-Vis on Paper** brand: warm Paper, Ink, cream cards, and
selective yellow action fills. The canonical palette, supplied vector provenance,
control styling, and rollout scope are in
[UI and Information Architecture](../../../../docs/18_UI_INFORMATION_ARCHITECTURE.md#brand-foundation).
This replaces the earlier teal/cool-neutral recommendation.

Use semantic tokens from `src/app/globals.css`. Keep links and notices in the
foreground color; primary yellow is a fill, not body text. Maintain the existing
`.dark` theme without adding a preference subsystem.

## Radius and Depth

Use rounded corners consistently, not randomly.

- Controls: approximately 10-12px visual radius.
- Cards/dialogs: approximately 14-16px visual radius.
- Pills/badges may use full rounding where semantically appropriate.
- Use one subtle border and restrained shadow rather than multiple shadow layers.
- Avoid glassmorphism, excessive blur, neon glow, and gradient-heavy chrome.

Follow the project's Maia-generated radius tokens when they differ from the reference values above.

## Typography

Prioritize legibility and operational scanning.

- Use the project's established sans family unless a deliberate brand typography decision is made.
- Use weight and size hierarchy before decorative type treatments.
- Dashboard titles should be clear but not oversized marketing headlines.
- Use tabular numerals where useful for codes, counts, or timestamps.
- Tracking codes and ticket identifiers may use a monospace treatment for scanability.

## Layout

### Provider Dashboard

Desktop:

- stable left navigation or equivalent shell;
- content area with generous but efficient spacing;
- page title + one clear primary action;
- summary cards followed by the working list/table;
- avoid dashboard-card overload.

Mobile:

- compact top bar/navigation sheet;
- summary information only when actionable;
- repairs shown as touch-friendly cards;
- keep `Create Repair` easy to reach.

### Public Tracking

Use a narrow centered content column. The tracking result should emphasize:

1. Provider identity;
2. device identity;
3. current Repair status;
4. latest customer-visible update;
5. last updated time.

Do not expose internal operational detail.

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

## UI Anti-Patterns

Avoid:

- rainbow status palettes;
- multiple competing primary buttons;
- oversized empty dashboard metrics;
- gradients on every card;
- hardcoded one-off radii or shadows;
- giant marketing-style headings inside operational screens;
- dense desktop tables on mobile;
- decorative icons with no information value;
- floating glass panels merely to look modern;
- rebuilding shadcn primitives without a concrete need.
