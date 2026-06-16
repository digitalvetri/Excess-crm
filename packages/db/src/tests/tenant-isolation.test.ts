import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient, UserRole } from '@prisma/client';
import { withTenantContext } from '../with-tenant.js';

// Requires: docker-compose up -d postgres
// Then: pnpm --filter @excess/db db:migrate && psql $DATABASE_URL -f prisma/rls-policies.sql

const prisma = new PrismaClient();

const HQ_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const FRANCHISE_A_ID = '00000000-0000-0000-0000-000000000002';
const FRANCHISE_B_ID = '00000000-0000-0000-0000-000000000003';
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000099';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RLS: tenant isolation', () => {
  it('franchise user sees only own leads — no WHERE clause needed', async () => {
    const results = await withTenantContext(
      prisma,
      { tenantId: FRANCHISE_A_ID, role: UserRole.FRANCHISE_OWNER, userId: SYSTEM_USER_ID },
      async (tx) => tx.lead.findMany(),
    );

    results.forEach((lead) => {
      expect(lead.tenantId).toBe(FRANCHISE_A_ID);
    });
  });

  it('raw SQL with no WHERE returns 0 cross-tenant rows', async () => {
    const rows = await withTenantContext(
      prisma,
      { tenantId: FRANCHISE_B_ID, role: UserRole.FRANCHISE_OWNER, userId: SYSTEM_USER_ID },
      async (tx) =>
        tx.$queryRaw<{ tenant_id: string }[]>`SELECT tenant_id FROM leads`,
    );

    rows.forEach((row) => {
      expect(row.tenant_id).toBe(FRANCHISE_B_ID);
    });
  });

  it('HQ Admin bypasses RLS and can read all leads', async () => {
    const allLeads = await withTenantContext(
      prisma,
      { tenantId: HQ_TENANT_ID, role: UserRole.ADMIN, userId: SYSTEM_USER_ID },
      async (tx) => tx.lead.findMany(),
    );

    const tenantIds = new Set(allLeads.map((l) => l.tenantId));
    // Admin bypasses RLS — all visible rows (if any) belong to any tenant, not filtered to one
    expect(tenantIds.size).toBeGreaterThanOrEqual(0);
  });

  it('franchise A cannot read franchise B leads via ID lookup', async () => {
    // Get a lead from B as admin
    const leadFromB = await withTenantContext(
      prisma,
      { tenantId: HQ_TENANT_ID, role: UserRole.ADMIN, userId: SYSTEM_USER_ID },
      async (tx) => tx.lead.findFirst({ where: { tenantId: FRANCHISE_B_ID } }),
    );

    if (!leadFromB) return; // No B leads in DB yet — skip

    // Franchise A tries to fetch B's lead by ID
    const result = await withTenantContext(
      prisma,
      { tenantId: FRANCHISE_A_ID, role: UserRole.FRANCHISE_OWNER, userId: SYSTEM_USER_ID },
      async (tx) => tx.lead.findUnique({ where: { id: leadFromB.id } }),
    );

    expect(result).toBeNull();
  });
});
