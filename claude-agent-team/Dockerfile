# ============================================================================
# Multi-stage Dockerfile for claude-agent-team
# Custom server.ts (Next.js 15 + Socket.IO) — requires tsx at runtime
# ============================================================================

# ---------------------------------------------------------------------------
# Stage 1: deps — Install ALL dependencies (including devDependencies)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Install dependencies needed for native modules (prisma, etc.)
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2: builder — Generate Prisma client + build Next.js
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (output: src/generated/prisma)
RUN npx prisma generate

# Build Next.js
# On Linux, next.config.ts sets distDir to /tmp/jm-agent-next
# We build and then copy the output back for the runner stage
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: runner — Production image (minimal footprint)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache libc6-compat openssl

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# --- Copy production node_modules ---
# tsx and @prisma/client are devDependencies but required at runtime
# for the custom server.ts entrypoint, so we copy the full node_modules
COPY --from=builder /app/node_modules ./node_modules

# --- Copy package.json (needed by Next.js runtime) ---
COPY --from=builder /app/package.json ./

# --- Copy Next.js build output ---
# On Linux, next.config.ts outputs to /tmp/jm-agent-next
# We copy it to the same location so the runtime config resolves correctly
COPY --from=builder /tmp/jm-agent-next /tmp/jm-agent-next

# --- Copy application source ---
# server.ts — custom HTTP server entrypoint
COPY --from=builder /app/server.ts ./
# start-server.js — CJS wrapper that spawns tsx server.ts
COPY --from=builder /app/start-server.js ./
# src/ — server-side code (socket-server, utils, etc.) + generated Prisma client
COPY --from=builder /app/src ./src
# Prisma schema (needed for migrations at deploy time)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
# Next.js + TypeScript config (required by tsx and Next.js runtime)
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/tsconfig.json ./
# .env.production (non-secret defaults)
COPY --from=builder /app/.env.production ./.env.production

# --- Create writable directories ---
RUN mkdir -p docs .agent-temp logs && \
    chown -R nextjs:nodejs /app /tmp/jm-agent-next

USER nextjs

EXPOSE 3000

# Health check — verify the server responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 -O /dev/null http://localhost:3000/api/health || exit 1

# Start via the CJS wrapper (node start-server.js → tsx server.ts)
# This avoids npx overhead and works reliably in Alpine
CMD ["node", "start-server.js"]
