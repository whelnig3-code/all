FROM node:20-alpine AS base
WORKDIR /app

# 의존성 설치
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/core/package.json ./packages/core/
COPY packages/adapters/package.json ./packages/adapters/
COPY packages/integrations/package.json ./packages/integrations/
COPY apps/api-server/package.json ./apps/api-server/
COPY apps/worker/package.json ./apps/worker/
RUN npm ci --omit=dev

# 빌드
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN npx turbo run build --filter=@smartstore/api-server

# 실행
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 app
COPY --from=builder --chown=app:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=app:nodejs /app/packages ./packages
COPY --from=builder --chown=app:nodejs /app/apps/api-server/dist ./apps/api-server/dist
COPY --from=builder --chown=app:nodejs /app/apps/api-server/package.json ./apps/api-server/
USER app
EXPOSE 3100
CMD ["node", "apps/api-server/dist/index.js"]
