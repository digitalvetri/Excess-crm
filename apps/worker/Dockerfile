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
CMD ["tsx", "apps/worker/src/server.ts"]
