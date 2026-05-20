import pino from 'pino';
import { prisma, withSystemContext, Prisma } from '@excess/db';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const SCORE_VERSION = 2;

interface ScoreFactor {
  name: string;
  contribution: number;
  evidence: string;
}

interface ScorableLead {
  id: string;
  stage: string;
  email: string | null;
  city: string | null;
  pincode: string | null;
  sourceType: string;
  receivedAt: Date;
}

const STAGE_POINTS: Record<string, number> = {
  NEW: 5,
  QUALIFIED: 25,
  FOLLOW_UP: 20,
  CONVERTED: 30,
  NOT_ANSWERED: 3,
  INVALID: 0,
  WRONG_ENQUIRY: 0,
};

const SOURCE_POINTS: Record<string, number> = {
  WEBSITE: 12,
  INDIAMART: 12,
  JUSTDIAL: 10,
  PHONE_INBOUND: 12,
  META: 9,
  WHATSAPP: 9,
  MANUAL: 7,
};

/**
 * Transparent rule-based lead score (v2). Every factor's contribution and
 * evidence is recorded so the UI can show exactly why a lead scored what it did.
 */
export function scoreLead(
  lead: ScorableLead,
  activityTypes: Set<string>,
): { score: number; breakdown: { factors: ScoreFactor[]; total: number; version: number } } {
  const factors: ScoreFactor[] = [];

  factors.push({
    name: 'Stage',
    contribution: STAGE_POINTS[lead.stage] ?? 0,
    evidence: lead.stage.replace(/_/g, ' '),
  });

  let contact = 0;
  const haveContact: string[] = [];
  if (lead.email) { contact += 5; haveContact.push('email'); }
  if (lead.city) { contact += 5; haveContact.push('city'); }
  if (lead.pincode) { contact += 5; haveContact.push('pincode'); }
  factors.push({
    name: 'Contact details',
    contribution: contact,
    evidence: haveContact.length ? haveContact.join(', ') : 'none on file',
  });

  let engagement = 0;
  const engEvidence: string[] = [];
  if (activityTypes.has('CALL')) { engagement += 8; engEvidence.push('called'); }
  if (activityTypes.has('NOTE')) { engagement += 4; engEvidence.push('note'); }
  if (activityTypes.has('QUOTATION_SENT')) { engagement += 8; engEvidence.push('quotation'); }
  if (activityTypes.has('APPOINTMENT_BOOKED')) { engagement += 5; engEvidence.push('appointment'); }
  engagement = Math.min(engagement, 25);
  factors.push({
    name: 'Engagement',
    contribution: engagement,
    evidence: engEvidence.length ? engEvidence.join(', ') : 'no activity yet',
  });

  factors.push({
    name: 'Source',
    contribution: SOURCE_POINTS[lead.sourceType] ?? 8,
    evidence: lead.sourceType,
  });

  const ageDays = (Date.now() - lead.receivedAt.getTime()) / 86_400_000;
  let recency = 0;
  let recencyEvidence = 'over 1 month old';
  if (ageDays < 2) { recency = 15; recencyEvidence = 'under 2 days old'; }
  else if (ageDays < 7) { recency = 10; recencyEvidence = 'under 1 week old'; }
  else if (ageDays < 30) { recency = 5; recencyEvidence = 'under 1 month old'; }
  factors.push({ name: 'Recency', contribution: recency, evidence: recencyEvidence });

  const total = Math.min(100, factors.reduce((s, f) => s + f.contribution, 0));
  return { score: total, breakdown: { factors, total, version: SCORE_VERSION } };
}

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
