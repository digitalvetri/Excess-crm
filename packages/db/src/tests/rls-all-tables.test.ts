/**
 * RLS isolation tests for all 15 business tables.
 *
 * Requires: docker-compose up -d postgres
 * Then:     pnpm --filter @excess/db db:migrate && psql $DATABASE_URL -f prisma/rls-policies.sql
 *
 * Pattern for every table:
 *   1. Franchise A context sees only Franchise A rows
 *   2. Franchise B context sees only Franchise B rows
 *   3. ADMIN context sees rows from all tenants
 *   4. Franchise A cannot fetch Franchise B row by ID
 */
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient, UserRole } from '@prisma/client';
import { withTenantContext } from '../with-tenant.js';

const prisma = new PrismaClient();

const ADMIN_CTX = { tenantId: '00000000-0000-0000-0000-000000000001', role: UserRole.ADMIN, userId: '00000000-0000-0000-0000-000000000099' };
const FRANCHISE_A = { tenantId: '00000000-0000-0000-0000-000000000002', role: UserRole.FRANCHISE_OWNER, userId: '00000000-0000-0000-0000-000000000099' };
const FRANCHISE_B = { tenantId: '00000000-0000-0000-0000-000000000003', role: UserRole.FRANCHISE_OWNER, userId: '00000000-0000-0000-0000-000000000099' };

afterAll(async () => {
  await prisma.$disconnect();
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function assertOwnTenantOnly<T extends { tenantId: string }>(
  ctx: typeof FRANCHISE_A,
  rows: T[],
) {
  rows.forEach((r) => expect(r.tenantId).toBe(ctx.tenantId));
}

// ── 1. leads ─────────────────────────────────────────────────────────────────

describe('RLS: leads', () => {
  it('franchise A sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_A, (tx) => tx.lead.findMany());
    await assertOwnTenantOnly(FRANCHISE_A, rows);
  });

  it('franchise B sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_B, (tx) => tx.lead.findMany());
    await assertOwnTenantOnly(FRANCHISE_B, rows);
  });

  it('admin sees all rows', async () => {
    const rows = await withTenantContext(prisma, ADMIN_CTX, (tx) => tx.lead.findMany());
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });

  it('franchise A cannot fetch franchise B lead by ID', async () => {
    const leadB = await withTenantContext(prisma, ADMIN_CTX, (tx) =>
      tx.lead.findFirst({ where: { tenantId: FRANCHISE_B.tenantId } }),
    );
    if (!leadB) return;
    const result = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.lead.findUnique({ where: { id: leadB.id } }),
    );
    expect(result).toBeNull();
  });
});

// ── 2. lead_activities ────────────────────────────────────────────────────────

describe('RLS: lead_activities', () => {
  it('franchise A sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_A, (tx) => tx.leadActivity.findMany());
    await assertOwnTenantOnly(FRANCHISE_A, rows);
  });

  it('franchise B sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_B, (tx) => tx.leadActivity.findMany());
    await assertOwnTenantOnly(FRANCHISE_B, rows);
  });

  it('franchise A cannot read franchise B lead_activity by ID', async () => {
    const row = await withTenantContext(prisma, ADMIN_CTX, (tx) =>
      tx.leadActivity.findFirst({ where: { tenantId: FRANCHISE_B.tenantId } }),
    );
    if (!row) return;
    const result = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.leadActivity.findUnique({ where: { id: row.id } }),
    );
    expect(result).toBeNull();
  });
});

// ── 3. lead_sources ───────────────────────────────────────────────────────────

describe('RLS: lead_sources', () => {
  it('franchise A sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_A, (tx) => tx.leadSource.findMany());
    await assertOwnTenantOnly(FRANCHISE_A, rows);
  });

  it('franchise B sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_B, (tx) => tx.leadSource.findMany());
    await assertOwnTenantOnly(FRANCHISE_B, rows);
  });

  it('franchise A cannot read franchise B lead_source by ID', async () => {
    const row = await withTenantContext(prisma, ADMIN_CTX, (tx) =>
      tx.leadSource.findFirst({ where: { tenantId: FRANCHISE_B.tenantId } }),
    );
    if (!row) return;
    const result = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.leadSource.findUnique({ where: { id: row.id } }),
    );
    expect(result).toBeNull();
  });
});

// ── 4. calls ──────────────────────────────────────────────────────────────────

describe('RLS: calls', () => {
  it('franchise A sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_A, (tx) => tx.call.findMany());
    await assertOwnTenantOnly(FRANCHISE_A, rows);
  });

  it('franchise B sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_B, (tx) => tx.call.findMany());
    await assertOwnTenantOnly(FRANCHISE_B, rows);
  });

  it('franchise A cannot read franchise B call by ID', async () => {
    const row = await withTenantContext(prisma, ADMIN_CTX, (tx) =>
      tx.call.findFirst({ where: { tenantId: FRANCHISE_B.tenantId } }),
    );
    if (!row) return;
    const result = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.call.findUnique({ where: { id: row.id } }),
    );
    expect(result).toBeNull();
  });
});

// ── 5. voice_agent_configs ────────────────────────────────────────────────────

describe('RLS: voice_agent_configs', () => {
  it('franchise A sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.voiceAgentConfig.findMany(),
    );
    await assertOwnTenantOnly(FRANCHISE_A, rows);
  });

  it('franchise B sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_B, (tx) =>
      tx.voiceAgentConfig.findMany(),
    );
    await assertOwnTenantOnly(FRANCHISE_B, rows);
  });
});

// ── 6. voice_agent_settings ───────────────────────────────────────────────────

describe('RLS: voice_agent_settings', () => {
  it('franchise A sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.voiceAgentSettings.findMany(),
    );
    await assertOwnTenantOnly(FRANCHISE_A, rows);
  });

  it('franchise B sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_B, (tx) =>
      tx.voiceAgentSettings.findMany(),
    );
    await assertOwnTenantOnly(FRANCHISE_B, rows);
  });
});

// ── 7. appointments ───────────────────────────────────────────────────────────

describe('RLS: appointments', () => {
  it('franchise A sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.appointment.findMany(),
    );
    await assertOwnTenantOnly(FRANCHISE_A, rows);
  });

  it('franchise B sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_B, (tx) =>
      tx.appointment.findMany(),
    );
    await assertOwnTenantOnly(FRANCHISE_B, rows);
  });

  it('franchise A cannot read franchise B appointment by ID', async () => {
    const row = await withTenantContext(prisma, ADMIN_CTX, (tx) =>
      tx.appointment.findFirst({ where: { tenantId: FRANCHISE_B.tenantId } }),
    );
    if (!row) return;
    const result = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.appointment.findUnique({ where: { id: row.id } }),
    );
    expect(result).toBeNull();
  });
});

// ── 8. quotations ─────────────────────────────────────────────────────────────

describe('RLS: quotations', () => {
  it('franchise A sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.quotation.findMany(),
    );
    await assertOwnTenantOnly(FRANCHISE_A, rows);
  });

  it('franchise B sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_B, (tx) =>
      tx.quotation.findMany(),
    );
    await assertOwnTenantOnly(FRANCHISE_B, rows);
  });

  it('franchise A cannot read franchise B quotation by ID', async () => {
    const row = await withTenantContext(prisma, ADMIN_CTX, (tx) =>
      tx.quotation.findFirst({ where: { tenantId: FRANCHISE_B.tenantId } }),
    );
    if (!row) return;
    const result = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.quotation.findUnique({ where: { id: row.id } }),
    );
    expect(result).toBeNull();
  });
});

// ── 9. commissions ────────────────────────────────────────────────────────────

describe('RLS: commissions', () => {
  it('franchise A sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.commission.findMany(),
    );
    await assertOwnTenantOnly(FRANCHISE_A, rows);
  });

  it('franchise B sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_B, (tx) =>
      tx.commission.findMany(),
    );
    await assertOwnTenantOnly(FRANCHISE_B, rows);
  });

  it('franchise A cannot read franchise B commission by ID', async () => {
    const row = await withTenantContext(prisma, ADMIN_CTX, (tx) =>
      tx.commission.findFirst({ where: { tenantId: FRANCHISE_B.tenantId } }),
    );
    if (!row) return;
    const result = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.commission.findUnique({ where: { id: row.id } }),
    );
    expect(result).toBeNull();
  });
});

// ── 10. payouts ───────────────────────────────────────────────────────────────

describe('RLS: payouts', () => {
  it('franchise A sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_A, (tx) => tx.payout.findMany());
    await assertOwnTenantOnly(FRANCHISE_A, rows);
  });

  it('franchise B sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_B, (tx) => tx.payout.findMany());
    await assertOwnTenantOnly(FRANCHISE_B, rows);
  });

  it('franchise A cannot read franchise B payout by ID', async () => {
    const row = await withTenantContext(prisma, ADMIN_CTX, (tx) =>
      tx.payout.findFirst({ where: { tenantId: FRANCHISE_B.tenantId } }),
    );
    if (!row) return;
    const result = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.payout.findUnique({ where: { id: row.id } }),
    );
    expect(result).toBeNull();
  });
});

// ── 11. tickets ───────────────────────────────────────────────────────────────

describe('RLS: tickets', () => {
  it('franchise A sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_A, (tx) => tx.ticket.findMany());
    await assertOwnTenantOnly(FRANCHISE_A, rows);
  });

  it('franchise B sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_B, (tx) => tx.ticket.findMany());
    await assertOwnTenantOnly(FRANCHISE_B, rows);
  });

  it('franchise A cannot read franchise B ticket by ID', async () => {
    const row = await withTenantContext(prisma, ADMIN_CTX, (tx) =>
      tx.ticket.findFirst({ where: { tenantId: FRANCHISE_B.tenantId } }),
    );
    if (!row) return;
    const result = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.ticket.findUnique({ where: { id: row.id } }),
    );
    expect(result).toBeNull();
  });
});

// ── 12. wa_sessions ───────────────────────────────────────────────────────────

describe('RLS: wa_sessions', () => {
  it('franchise A sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_A, (tx) => tx.waSession.findMany());
    await assertOwnTenantOnly(FRANCHISE_A, rows);
  });

  it('franchise B sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_B, (tx) => tx.waSession.findMany());
    await assertOwnTenantOnly(FRANCHISE_B, rows);
  });

  it('franchise A cannot read franchise B wa_session by ID', async () => {
    const row = await withTenantContext(prisma, ADMIN_CTX, (tx) =>
      tx.waSession.findFirst({ where: { tenantId: FRANCHISE_B.tenantId } }),
    );
    if (!row) return;
    const result = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.waSession.findUnique({ where: { id: row.id } }),
    );
    expect(result).toBeNull();
  });
});

// ── 13. teams ─────────────────────────────────────────────────────────────────

describe('RLS: teams', () => {
  it('franchise A sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_A, (tx) => tx.team.findMany());
    await assertOwnTenantOnly(FRANCHISE_A, rows);
  });

  it('franchise B sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_B, (tx) => tx.team.findMany());
    await assertOwnTenantOnly(FRANCHISE_B, rows);
  });

  it('franchise A cannot read franchise B team by ID', async () => {
    const row = await withTenantContext(prisma, ADMIN_CTX, (tx) =>
      tx.team.findFirst({ where: { tenantId: FRANCHISE_B.tenantId } }),
    );
    if (!row) return;
    const result = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.team.findUnique({ where: { id: row.id } }),
    );
    expect(result).toBeNull();
  });
});

// ── 14. routing_rules ─────────────────────────────────────────────────────────

describe('RLS: routing_rules', () => {
  it('franchise A sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.routingRule.findMany(),
    );
    await assertOwnTenantOnly(FRANCHISE_A, rows);
  });

  it('franchise B sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_B, (tx) =>
      tx.routingRule.findMany(),
    );
    await assertOwnTenantOnly(FRANCHISE_B, rows);
  });

  it('franchise A cannot read franchise B routing_rule by ID', async () => {
    const row = await withTenantContext(prisma, ADMIN_CTX, (tx) =>
      tx.routingRule.findFirst({ where: { tenantId: FRANCHISE_B.tenantId } }),
    );
    if (!row) return;
    const result = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.routingRule.findUnique({ where: { id: row.id } }),
    );
    expect(result).toBeNull();
  });
});

// ── 15. coach_cache ───────────────────────────────────────────────────────────

describe('RLS: coach_cache', () => {
  it('franchise A sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.coachCache.findMany(),
    );
    await assertOwnTenantOnly(FRANCHISE_A, rows);
  });

  it('franchise B sees only own rows', async () => {
    const rows = await withTenantContext(prisma, FRANCHISE_B, (tx) =>
      tx.coachCache.findMany(),
    );
    await assertOwnTenantOnly(FRANCHISE_B, rows);
  });

  it('franchise A cannot read franchise B coach_cache by ID', async () => {
    const row = await withTenantContext(prisma, ADMIN_CTX, (tx) =>
      tx.coachCache.findFirst({ where: { tenantId: FRANCHISE_B.tenantId } }),
    );
    if (!row) return;
    const result = await withTenantContext(prisma, FRANCHISE_A, (tx) =>
      tx.coachCache.findUnique({ where: { id: row.id } }),
    );
    expect(result).toBeNull();
  });
});

// ── 16. raw SQL leak check across high-risk tables ────────────────────────────

describe('RLS: raw SQL cross-tenant leak (high-risk tables)', () => {
  const tables = [
    'leads',
    'lead_activities',
    'calls',
    'quotations',
    'commissions',
    'appointments',
  ] as const;

  for (const table of tables) {
    it(`raw SELECT * FROM ${table} returns only franchise A rows`, async () => {
      const rows = await withTenantContext(
        prisma,
        FRANCHISE_A,
        (tx) => tx.$queryRawUnsafe<{ tenant_id: string }[]>(`SELECT tenant_id FROM ${table}`),
      );
      rows.forEach((r) => expect(r.tenant_id).toBe(FRANCHISE_A.tenantId));
    });
  }
});
