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

Use a cool neutral foundation with a restrained teal technology/service accent.

Suggested light-theme reference values:

| Token | Reference |
|---|---|
| Background | `#F8FAFC` |
| Surface/Card | `#FFFFFF` |
| Foreground | `#0F172A` |
| Muted surface | `#F1F5F9` |
| Muted text | `#64748B` |
| Border | `#E2E8F0` |
| Primary | `#0F766E` |
| Primary hover | `#115E59` |
| Soft accent | `#CCFBF1` |
| Focus/accent | `#14B8A6` |
| Success | `#15803D` |
| Warning | `#B45309` |
| Destructive | `#B91C1C` |

Treat these as a coherent design direction, not permission to scatter raw hex values. Map them into CSS/theme variables and use semantic tokens in components.

Do not add dark mode unless it is explicitly in scope or already supported by the repository.

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

- `IN_PROGRESS`: primary/neutral informative treatment.
- `WAITING_FOR_PARTS`: warning treatment.
- `AWAITING_APPROVAL`: attention/warning treatment distinct from destructive errors.
- `READY`: positive/success treatment.
- `COMPLETED`: subdued success/neutral completed treatment.

Use badge background + text + optional icon; do not rely on color alone.

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
