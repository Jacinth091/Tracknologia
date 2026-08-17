# syntax=docker/dockerfile:1

# Tracknologia — Next.js Alpine Dockerfile
#
# Targets:
#   development  -> local Docker Compose development
#   runner       -> optimized production image
#
# Production requires:
#   next.config.ts -> output: "standalone"

ARG NODE_VERSION=24.18.0-alpine3.24

# ------------------------------------------------------------
# Base
# ------------------------------------------------------------
FROM node:${NODE_VERSION} AS base

WORKDIR /app

# Alpine uses musl libc. libc6-compat improves compatibility with
# Node/native packages that expect common glibc compatibility symbols.
RUN apk add --no-cache libc6-compat

ENV NEXT_TELEMETRY_DISABLED=1

# ------------------------------------------------------------
# Dependencies
# ------------------------------------------------------------
FROM base AS deps

COPY package.json package-lock.json ./

# Deterministic dependency install from the committed lockfile.
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ------------------------------------------------------------
# Development
# ------------------------------------------------------------
FROM base AS development

ENV NODE_ENV=development

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

ENV HOSTNAME=0.0.0.0
ENV PORT=3000

CMD ["npm", "run", "dev"]

# ------------------------------------------------------------
# Builder
# ------------------------------------------------------------
FROM base AS builder

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are public by definition and may be embedded
# into the browser bundle during the Next.js build.
# Pass these as Docker build args only if your build requires them.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}

RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ------------------------------------------------------------
# Production runner
# ------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Writable runtime directory for Next.js cache / optimized images.
RUN mkdir .next \
    && chown nextjs:nodejs .next

# With `output: "standalone"`, Next.js emits the minimal runtime
# and traced dependencies into .next/standalone.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
