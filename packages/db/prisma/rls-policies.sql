-- Row-Level Security policies for Excess CRM
-- Run AFTER prisma migrate: psql $DATABASE_URL -f packages/db/prisma/rls-policies.sql

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_app') THEN
    CREATE ROLE crm_app LOGIN PASSWORD 'change-in-production';
  END IF;
END $$;

-- Schema-driven: enable RLS on EVERY base table in `public` that carries a
-- `tenant_id` column, so new tenant-scoped tables are covered automatically
-- and none are forgotten. Pre-auth tables (looked up before a tenant context
-- exists) are excluded — `users` (login by email), `sessions`, `audit_log`.
-- NOTE: kept in sync with packages/db/src/ensure-rls.ts (applied at API boot).
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

    -- Drop existing policies if re-running
    EXECUTE format('DROP POLICY IF EXISTS admin_bypass ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);

    -- HQ Admin bypasses RLS
    EXECUTE format(
      'CREATE POLICY admin_bypass ON %I FOR ALL TO crm_app
       USING (current_setting(''app.role'', true) = ''ADMIN'')',
      t
    );

    -- Everyone else sees only their tenant
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO crm_app
       USING (
         current_setting(''app.role'', true) != ''ADMIN''
         AND tenant_id::text = current_setting(''app.tenant_id'', true)
       )',
      t
    );

    RAISE NOTICE 'RLS enabled on table: %', t;
  END LOOP;
END;
$body$;

-- Grant table access to crm_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;
