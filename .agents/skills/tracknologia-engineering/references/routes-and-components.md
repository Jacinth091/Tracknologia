# Routes and Components

## Route Groups

Use Next.js route groups to separate public, authentication, and Provider experiences without changing URLs.

```text
src/app/
├── (public)/
│   ├── page.tsx
│   ├── track/page.tsx
│   └── p/[providerSlug]/request/page.tsx
├── (auth)/
│   ├── login/page.tsx
│   ├── register/page.tsx
│   └── forgot-password/page.tsx
└── (provider)/
    └── dashboard/
        ├── layout.tsx
        ├── page.tsx
        ├── repairs/
        │   ├── page.tsx
        │   ├── new/page.tsx
        │   └── [repairId]/page.tsx
        ├── requests/
        │   ├── page.tsx
        │   └── [requestId]/page.tsx
        └── settings/page.tsx
```

Do not install React Router. Next.js App Router owns routing.

## Page Responsibilities

Pages should:

- resolve route params;
- obtain trusted auth/Provider context;
- call feature Interfaces;
- compose UI;
- adapt failures into appropriate user-facing states.

Pages should not implement repair lifecycle rules, ticket generation, authorization logic, or persistence transactions.

## Server Actions

Treat Server Actions as adapters from form/browser input to feature Interfaces. Validate untrusted input and resolve Provider identity on the server. Never trust browser-supplied `providerId`, `userId`, or `role` when they can be derived from the authenticated session.

## Component Placement

Use three levels:

1. `src/components/ui/` for shadcn/Base UI primitives.
2. `src/components/shared/` for genuinely cross-feature pieces such as the app logo, page header, empty-state shell, or navigation shell.
3. Route-local `_components/` or feature-local UI when only one area owns it.

Example:

```text
app/(provider)/dashboard/repairs/
├── page.tsx
└── _components/
    ├── repair-list.tsx
    ├── repair-card.tsx
    └── repair-filters.tsx
```

Do not promote a component to `shared` after one reuse. Promote only when it is conceptually shared and should evolve consistently across owners.

## Forms

Use clear sections and progressive disclosure. Do not overwhelm customers or repairers with every optional field at once.

- Customer Repair Request: emphasize contact, device type, reported problem, and preferred Service Mode; advanced device details remain optional.
- Provider Repair intake: allow richer device snapshot, condition, accessories, initial observation, diagnosis, and internal notes.
- Use inline validation near fields and preserve entered values after validation failures.

## Responsive Rules

Design mobile-first, then widen.

- Phone: cards/lists, single-column forms, compact navigation, full-width primary actions where helpful.
- Tablet: two-column summaries where space allows.
- Desktop: sidebar/provider shell, wider tables or split-detail layouts.
- Do not force desktop tables onto narrow screens; use cards or responsive row patterns.
- Avoid horizontal scrolling for core repair workflows.

Independent repairers may operate almost entirely from a phone browser, so `Create Repair`, request review, status updates, and customer lookup must remain efficient on small screens.
