FROM node:20-alpine
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
EXPOSE 8000
# Apply schema (this repo uses `prisma db push`, no migration files) before booting,
# so additive schema changes land on deploy. --skip-generate: the client is already
# generated at build time and node_modules isn't writable by the app user.
# Non-destructive by default: db push refuses data-loss changes and the boot fails loudly.
CMD ["sh", "-c", "pnpm --filter @excess/db exec prisma db push --skip-generate && exec tsx apps/api/src/server.ts"]
