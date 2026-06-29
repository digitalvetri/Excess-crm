import type { PrismaClient } from '@prisma/client';

/**
 * Minimal logger shape — satisfied by both Fastify's `app.log` (pino) and a
 * plain console-free fallback. Keeps this helper free of a Fastify dependency.
 */
export interface RlsLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

// ── SQL statements (kept in sync with packages/db/prisma/rls-policies.sql) ────
// Each is applied as its OWN statement: `$executeRawUnsafe` runs a single
// command, so the multi-statement .sql file cannot be pushed as one string.

const ROLE_SQL = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_app') THEN
    CREATE ROLE crm_app LOGIN PASSWORD 'change-in-production';
  END IF;
END $$;
`;

// Schema-driven: every base table in `public` with a `tenant_id` column, minus
// the pre-auth tables that are queried before a tenant context exists.
const TABLE_RLS_SQL = `
DO $body$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND tb.table_type = 'BASE TABLE'
      AND c.table_name NOT IN ('users', 'sessions', 'audit_log')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_bypass ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY admin_bypass ON %I FOR ALL TO crm_app
       USING (current_setting(''app.role'', true) = ''ADMIN'')',
      t
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO crm_app
       USING (
         current_setting(''app.role'', true) != ''ADMIN''
         AND tenant_id::text = current_setting(''app.tenant_id'', true)
       )',
      t
    );
  END LOOP;
END;
$body$;
`;

const GRANT_TABLES_SQL =
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crm_app';
const GRANT_SEQUENCES_SQL =
  'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app';

/**
 * Apply Row-Level Security policies (packages/db/prisma/rls-policies.sql) to the
 * running database at API boot. Idempotent — DROP+CREATE POLICY and
 * `IF NOT EXISTS` mean re-running is a no-op.
 *
 * SAFETY: `FORCE ROW LEVEL SECURITY` plus policies scoped `TO crm_app` would,
 * if the connecting role were a NON-superuser, NON-crm_app table owner, cause
 * every query to silently return zero rows — a total outage that no try/catch
 * can detect (it is not a statement error). So we only apply when it is
 * provably safe: a superuser (which bypasses RLS entirely) or crm_app itself.
 * Otherwise we skip and warn. Never throws — a failure here must not crash boot.
 */
export async function ensureRls(prisma: PrismaClient, log: RlsLogger): Promise<void> {
  let canApply = false;
  let currentUser: string | undefined;
  try {
    const rows = await prisma.$queryRaw<{ current_user: string; rolsuper: boolean | null }[]>`
      SELECT current_user,
             (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS rolsuper
    `;
    const row = rows[0];
    currentUser = row?.current_user;
    canApply = !!row && (row.rolsuper === true || row.current_user === 'crm_app');
  } catch (err) {
    log.error({ err }, 'rls.precheck_failed — skipping RLS application');
    return;
  }

  if (!canApply) {
    log.warn(
      { currentUser },
      'rls.skipped — connecting role is neither superuser nor crm_app; applying FORCE RLS could lock out all queries',
    );
    return;
  }

  const statements: ReadonlyArray<readonly [string, string]> = [
    ['role', ROLE_SQL],
    ['tables', TABLE_RLS_SQL],
    ['grant_tables', GRANT_TABLES_SQL],
    ['grant_sequences', GRANT_SEQUENCES_SQL],
  ];

  let applied = 0;
  for (const [name, sql] of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      applied += 1;
    } catch (err) {
      // A single already-applied / permission-denied statement must not abort
      // the rest or crash the API.
      log.error({ err, statement: name }, 'rls.statement_failed');
    }
  }

  log.info({ currentUser, applied, total: statements.length }, 'rls.ensured');
}
