# Unified backend image. api and worker are byte-identical builds (same deps, same Prisma
# client) — only the entrypoint differs. A shared `base` stage means the heavy
# `pnpm install` + `prisma generate` runs ONCE: the deploy uses buildx bake (one build
# session), which dedupes the shared stage across both targets instead of doing it twice.
FROM node:20-alpine AS base
RUN apk add --no-cache openssl
RUN corepack enable pnpm && npm install -g tsx
WORKDIR /app
COPY . .
RUN NODE_ENV=development pnpm install --frozen-lockfile
RUN PATH="/app/node_modules/.bin:$PATH" pnpm --filter @excess/db run db:generate
RUN addgroup -S app && adduser -S app -G app && \
    chown -R app:app /app/apps /app/packages
USER app
ENV NODE_ENV=production

FROM base AS api
EXPOSE 8000
CMD ["tsx", "apps/api/src/server.ts"]

FROM base AS worker
CMD ["tsx", "apps/worker/src/server.ts"]
