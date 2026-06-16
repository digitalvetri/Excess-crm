import type { Job } from 'bullmq';
import { prisma, withSystemContext, SYSTEM_TENANT_ID } from '@excess/db';
import type { LeadSourceType } from '@excess/db';
import { env } from '@excess/config';
import { queues } from '../queues.js';
import { assignLead } from '../lib/assignment-engine.js';

// L6: Read from env so any operator change takes effect without a code deploy
const BUSINESS_HOURS_START = parseInt(env.BUSINESS_HOURS_START.split(':')[0]!, 10);
const BUSINESS_HOURS_END   = parseInt(env.BUSINESS_HOURS_END.split(':')[0]!, 10);
const IST_OFFSET_MS        = (5 * 60 + 30) * 60 * 1000;

/**
 * If the originating tenant is HQ and the lead has a pincode, look up which
 * franchise territory covers it. Returns the franchise tenantId on match,
 * or the original tenantId when no match is found.
 */
async function resolveLeadTenant(hqTenantId: string, pincode: string | undefined): Promise<string> {
  if (!pincode) return hqTenantId;

  // L5: Use withSystemContext — tenant table has RLS enforced
  const [hqTenant, franchises] = await withSystemContext(prisma, SYSTEM_TENANT_ID, async (tx) => {
    const hq = await tx.tenant.findUnique({ where: { id: hqTenantId }, select: { type: true } });
    const frs = hq?.type === 'HQ'
      ? await tx.tenant.findMany({
          where: { type: 'FRANCHISE', status: 'ACTIVE', deletedAt: null },
          select: { id: true, territory: true },
        })
      : [];
    return [hq, frs] as const;
  });

  if (hqTenant?.type !== 'HQ') return hqTenantId;

  for (const f of franchises) {
    const territory = f.territory as { pinCodes?: string[] } | null;
    if (territory?.pinCodes?.includes(pincode)) return f.id;
  }

  return hqTenantId;
}

export interface LeadIngestPayload {
  sourceType: LeadSourceType;
  sourceId?: string;
  tenantId: string;
  externalId?: string;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  pincode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  rawData: Record<string, unknown>;
}

function isBusinessHours(): boolean {
  const now = new Date();
  const istHour = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
  return istHour >= BUSINESS_HOURS_START && istHour < BUSINESS_HOURS_END;
}

// L1: Fixed — computes UTC equivalent of IST BUSINESS_HOURS_START correctly.
// IST 09:00 = UTC 03:30; IST 21:00 = UTC 15:30.
function msUntilNextBusinessHour(): number {
  const nowMs = Date.now();
  const nowIst = new Date(nowMs + IST_OFFSET_MS);

  // Convert IST start hour to UTC: subtract 5h30m
  const utcHour = (BUSINESS_HOURS_START * 60 - 330 + 1440) % 1440;
  const targetUtcH = Math.floor(utcHour / 60);
  const targetUtcM = utcHour % 60;

  const target = new Date(Date.UTC(
    nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate(),
    targetUtcH, targetUtcM, 0, 0,
  ));

  if (target.getTime() <= nowMs) {
    target.setUTCDate(target.getUTCDate() + 1);
  }

  return target.getTime() - nowMs;
}

export async function processLeadIngest(job: Job<LeadIngestPayload>): Promise<void> {
  const { tenantId: rawTenantId, sourceType, sourceId, externalId, name, phone, email, city, pincode,
    utmSource, utmMedium, utmCampaign, utmContent, utmTerm, rawData } = job.data;

  // Route to franchise tenant if pincode matches a territory
  const tenantId = await resolveLeadTenant(rawTenantId, pincode);
  if (tenantId !== rawTenantId) {
    await job.log(`Territory routing: pincode=${pincode} matched franchise tenant=${tenantId}`);
  }

  // dnd_list has no RLS — safe to query directly
  const dnd = await prisma.dndList.findFirst({ where: { phone } });
  if (dnd) {
    await job.log(`Phone ${phone} is on DND list, skipping voice dial`);
  }

  const lead = await withSystemContext(prisma, tenantId, async (tx) => {
    // Deduplicate by phone within tenant (RLS scoped query)
    const existing = await tx.lead.findFirst({
      where: { tenantId, phone },
      select: { id: true },
    });
    if (existing) {
      await job.log(`Duplicate lead phone=${phone} tenant=${tenantId}, skipping`);
      return null;
    }

    const created = await tx.lead.create({
      data: {
        tenantId,
        name,
        phone,
        phoneRaw: phone,
        email: email ?? null,
        city: city ?? null,
        stage: 'NEW',
        sourceType,
        sourceId: sourceId ?? null,
        externalId: externalId ?? null,
        rawPayload: rawData as object,
        pincode: pincode ?? null,
        utmSource: utmSource ?? null,
        utmMedium: utmMedium ?? null,
        utmCampaign: utmCampaign ?? null,
        utmContent: utmContent ?? null,
        utmTerm: utmTerm ?? null,
      },
    });

    await tx.leadActivity.create({
      data: {
        leadId: created.id,
        tenantId,
        type: 'NOTE',
        actorIsAi: true,
        payload: { note: `Lead ingested from ${sourceType}` } as object,
      },
    });

    // Auto-assign via routing rules engine
    await assignLead(tx as Parameters<typeof assignLead>[0], tenantId, created.id, {
      pincode: pincode ?? null,
      city: city ?? null,
      sourceType,
    });

    return created;
  });

  if (!lead) return;

  // L4: Only enqueue voice-dial when the global kill-switch is on
  if (!env.ENABLE_AI_DIAL) {
    await job.log('AI dialing disabled (ENABLE_AI_DIAL=false), skipping voice-dial enqueue');
    return;
  }

  if (!dnd && isBusinessHours()) {
    await queues.voiceDial.add(
      'voice-dial',
      { leadId: lead.id, tenantId, personaId: 'RESHMA_VERIFY' },
      { delay: 0, priority: 1 },
    );
  } else if (!dnd) {
    await queues.voiceDial.add(
      'voice-dial',
      { leadId: lead.id, tenantId, personaId: 'RESHMA_VERIFY' },
      { delay: msUntilNextBusinessHour(), priority: 2 },
    );
  }
}
