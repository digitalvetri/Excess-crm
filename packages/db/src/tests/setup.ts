// Ensure DATABASE_URL is set before any PrismaClient is constructed.
// Vitest's tinypool worker threads do not inherit process.env from the
// parent — they start with a near-empty env. This file runs via
// vitest.config.ts setupFiles before any test module is imported.
process.env['DATABASE_URL'] ??=
  'postgres://crm_app:change-in-production@localhost:5432/excess_crm_test';
