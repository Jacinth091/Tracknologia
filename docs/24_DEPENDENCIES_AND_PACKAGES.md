# 24 — Dependencies and Packages

## Scaffold

Use `create-next-app` with the recommended App Router defaults:

- TypeScript
- ESLint
- Tailwind CSS
- App Router
- Turbopack
- `@/*` import alias

## Core dependencies

Install immediately:

```bash
npm install zod @supabase/supabase-js @supabase/ssr server-only
```

### Zod

Owns runtime/server input validation for Provider, Repair Request, Repair, status, and tracking inputs.

### Supabase packages

- `@supabase/supabase-js` — Supabase client
- `@supabase/ssr` — cookie/session integration for Next.js SSR

### server-only

Marks sensitive server-only implementation modules and helps catch accidental client imports.

## shadcn/ui

Initialize:

```bash
npx shadcn@latest init
```

Add only components that are actually needed. Initial candidates:

```text
button
input
textarea
label
select
card
badge
dialog
table
dropdown-menu
sheet
sonner
```

shadcn-generated primitives belong under `src/components/ui/`.

## Testing dependencies

Suggested:

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react
npm init playwright@latest
```

Exact generated testing configuration should follow the versions installed at project bootstrap time.

## Do not install initially

### React Router

No. Next.js App Router owns routing.

### Axios

No. Use native `fetch` where HTTP is required and direct Module calls on the server where HTTP is not required.

### Express / NestJS

No for MVP. Next.js provides the server runtime needed by the responsive-web application.

### Prisma

Not initially. The current schema is manageable through Supabase/PostgreSQL persistence adapters. Revisit only if persistence/migration ergonomics justify it.

### Redux / Zustand

No current global client-state requirement justifies them.

### React Hook Form

Optional later if Create Repair / Repair Request forms become sufficiently dynamic that native React/Next form handling becomes cumbersome.

## Locking dependency behavior

- commit `package-lock.json`;
- use `npm ci` in Docker/CI when installing from the lockfile;
- do not commit host `node_modules`;
- pin the Node major/exact image used by the development container.
