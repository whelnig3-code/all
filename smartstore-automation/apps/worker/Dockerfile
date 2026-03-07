FROM node:20-alpine AS base
WORKDIR /app

# Playwright용 Chromium 의존성
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/core/package.json ./packages/core/
COPY packages/adapters/package.json ./packages/adapters/
COPY packages/crawlers/package.json ./packages/crawlers/
COPY packages/integrations/package.json ./packages/integrations/
COPY apps/worker/package.json ./apps/worker/
RUN npm ci --omit=dev
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN npx turbo run build --filter=@smartstore/worker

FROM base AS runner
ENV NODE_ENV=production
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 app
COPY --from=builder --chown=app:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=app:nodejs /app/packages ./packages
COPY --from=builder --chown=app:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=app:nodejs /app/apps/worker/package.json ./apps/worker/
USER app
CMD ["node", "apps/worker/dist/index.js"]
