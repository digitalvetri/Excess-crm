import pino from 'pino';
import { prisma, withSystemContext, Prisma } from '@excess/db';
import { scoreLead, type ScorableLead } from '@excess/shared';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

async function scoreTenantLeads(tenantId: string): Promise<number> {
  const leads = (await withSystemContext(prisma, tenantId, (tx) =>
    tx.lead.findMany({
      where: { tenantId },
      select: {
        id: true, stage: true, email: true, city: true,
        pincode: true, sourceType: true, receivedAt: true,
      },
    }),
  )) as ScorableLead[];
  if (leads.length === 0) return 0;

  const activities = await withSystemContext(prisma, tenantId, (tx) =>
    tx.leadActivity.findMany({ where: { tenantId }, select: { leadId: true, type: true } }),
  );
  const actsByLead = new Map<string, Set<string>>();
  for (const a of activities) {
    const set = actsByLead.get(a.leadId) ?? new Set<string>();
    set.add(a.type);
    actsByLead.set(a.leadId, set);
  }

  for (const lead of leads) {
    const { score, breakdown } = scoreLead(lead, actsByLead.get(lead.id) ?? new Set());
    await withSystemContext(prisma, tenantId, (tx) =>
      tx.lead.update({
        where: { id: lead.id },
        data: {
          aiScore: score,
          aiScoreBreakdown: breakdown as unknown as Prisma.InputJsonValue,
          scoredAt: new Date(),
        },
      }),
    );
  }
  return leads.length;
}

// v1 policy: every lead is recomputed each run (no manual-override carve-out).
export async function runLeadScoring(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  let total = 0;
  for (const { id } of tenants) {
    try {
      total += await scoreTenantLeads(id);
    } catch (err) {
      log.error({ tenantId: id, err }, 'lead_scoring.tenant_error');
    }
  }
  log.info({ tenants: tenants.length, leadsScored: total }, 'lead_scoring.complete');
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

export function startLeadScoringScheduler(): void {
  const run = () => {
    void runLeadScoring().catch((err: unknown) => log.error({ err }, 'lead_scoring.run_error'));
  };

  setTimeout(run, 8 * 60 * 1000); // 8-min startup offset
  setInterval(run, CHECK_INTERVAL_MS);

  log.info({ intervalMs: CHECK_INTERVAL_MS }, 'lead_scoring_scheduler.started');
}
