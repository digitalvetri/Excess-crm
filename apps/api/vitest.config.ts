import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    timeout: 30000,
    // Explicitly forward required env vars so they survive vitest's fork context.
    // Values come from process.env (set by CI job env: block or local .env).
    env: {
      DATABASE_URL: process.env['DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5432/excess_crm_test',
      REDIS_URL: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
      SESSION_SECRET: process.env['SESSION_SECRET'] ?? 'test-session-secret-at-least-32-chars-long-default',
      NODE_ENV: 'test',
      LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'error',
      COOKIE_DOMAIN: process.env['COOKIE_DOMAIN'] ?? 'localhost',
    },
  },
});
