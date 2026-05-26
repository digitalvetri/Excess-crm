FROM node:20-alpine
RUN apk add --no-cache openssl
RUN corepack enable pnpm && npm install -g tsx
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ENV PATH="/app/node_modules/.bin:$PATH"
RUN pnpm --filter @excess/db run db:generate
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
ENV NODE_ENV=production
CMD ["tsx", "apps/worker/src/server.ts"]
