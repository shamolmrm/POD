# syntax=docker/dockerfile:1
# POD API + worker (NestJS, Prisma). The same image runs `node dist/main.js` or `node dist/worker.js`.

FROM node:24-alpine AS base
RUN apk add --no-cache openssl && npm install -g pnpm@12.16.1
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

# ── test stage: typecheck + unit tests (used by deploy.sh before the runtime image) ──
FROM build AS test
RUN pnpm typecheck && pnpm test

# ── runtime ──
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --prod && pnpm exec prisma generate \
    && addgroup -S -g 1001 pod && adduser -S -u 1001 -G pod pod
COPY --from=build /app/dist ./dist
USER pod
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health >/dev/null || exit 1
# Apply database migrations, then serve.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && exec node dist/main.js"]
