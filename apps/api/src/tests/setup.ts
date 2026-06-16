// Set required env vars before any module (Prisma, @excess/config) loads.
// Vitest tinypool workers start with a near-empty process.env.
process.env['DATABASE_URL'] ??=
  'postgres://postgres:postgres@localhost:5432/excess_crm_test';
process.env['REDIS_URL'] ??= 'redis://localhost:6379';
process.env['SESSION_SECRET'] ??=
  'test-session-secret-at-least-32-chars-long-default';
process.env['NODE_ENV'] ??= 'test';
