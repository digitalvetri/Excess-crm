-- Row-Level Security policies for Excess CRM
-- Run AFTER prisma migrate: psql $DATABASE_URL -f packages/db/prisma/rls-policies.sql

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_app') THEN
    CREATE ROLE crm_app LOGIN PASSWORD 'change-in-production';
  END IF;
END $$;

-- Helper macro: for each business table, run:
--   ENABLE RLS, FORCE RLS, admin bypass, tenant isolation

DO $body$
DECLARE
  t text;
  tables text[] := ARRAY[
    'leads', 'lead_activities', 'lead_sources',
    'calls', 'voice_agent_configs', 'voice_agent_settings',
    'appointments', 'quotations',
    'commissions', 'payouts',
    'tickets', 'wa_sessions',
    'teams', 'routing_rules',
    'coach_cache',
    'stage_gates', 'sla_rules', 'csv_imports',
    'projects', 'broadcasts', 'broadcast_recipients',
    'sequences', 'sequence_enrollments', 'service_tickets'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
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
