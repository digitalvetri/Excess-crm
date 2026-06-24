import { PrismaClient } from '@prisma/client';

// One-off DDL capability probe. Adds a throwaway column to wa_sessions and drops it
// immediately, to determine whether the production DB role can run schema changes
// (ALTER/CREATE). Safe — touches no real data. Run via:
//   pnpm --filter @excess/db run probe:ddl
const prisma = new PrismaClient();

async function main(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE wa_sessions ADD COLUMN IF NOT EXISTS _probe boolean');
    await prisma.$executeRawUnsafe('ALTER TABLE wa_sessions DROP COLUMN _probe');
    console.log('RESULT: DDL OK — the database can apply schema changes.');
  } catch (e) {
    console.log('RESULT: DDL FAILED -', e instanceof Error ? e.message : String(e));
  } finally {
    await prisma.$disconnect();
  }
}

void main();
