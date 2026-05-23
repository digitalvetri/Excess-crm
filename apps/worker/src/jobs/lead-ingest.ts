import type { Job } from 'bullmq';
import { prisma, withSystemContext } from '@excess/db';
import type { LeadSourceType } from '@excess/db';
import { queues } from '../queues.js';
import { assignLead } from '../lib/assignment-engine.js';

/**
 * If the originating tenant is HQ and the lead has a pincode, look up which
 * franchise territory covers it. Returns the franchise tenantId on match,
 * or the original tenantId when no match is found.
 */
async function resolveLeadTenant(hqTenantId: string, pincode: string | undefined): Promise<string> {
  if (!pincode) return hqTenantId;

  const hqTenant = await prisma.tenant.findUnique({
    where: { id: hqTenantId },
    select: { type: true },
  });
  if (hqTenant?.type !== 'HQ') return hqTenantId;

  const franchises = await prisma.tenant.findMany({
    where: { type: 'FRANCHISE', status: 'ACTIVE', deletedAt: null },
    select: { id: true, territory: true },
  });

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

const BUSINESS_HOURS_START = 9;
const BUSINESS_HOURS_END = 21;

function isBusinessHours(): boolean {
  const now = new Date();
  const istHour = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
  return istHour >= BUSINESS_HOURS_START && istHour < BUSINESS_HOURS_END;
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

function msUntilNextBusinessHour(): number {
  const now = new Date();
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const nowIst = new Date(now.getTime() + istOffsetMs);
  const nextStart = new Date(nowIst);
  nextStart.setUTCHours(BUSINESS_HOURS_START, 0, 0, 0);
  if (nextStart <= nowIst) {
    nextStart.setUTCDate(nextStart.getUTCDate() + 1);
  }
  return nextStart.getTime() - nowIst.getTime();
}
