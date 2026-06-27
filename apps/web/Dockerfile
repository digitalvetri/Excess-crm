FROM node:20-alpine AS base
RUN corepack enable pnpm

FROM base AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN NODE_ENV=development pnpm install --frozen-lockfile
# Cap the Next build's V8 heap so it can't balloon and get OOM-killed on a constrained
# server. Only affects this builder stage (the runner stage is separate). Bump if a build
# legitimately needs more, but 3 GB comfortably builds this app.
RUN NODE_OPTIONS="--max-old-space-size=3072" pnpm --filter @excess/web run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=app:app /app/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
