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

// ─── Meta Graph API enrichment ────────────────────────────────────────────────

interface MetaLeadFields {
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

/**
 * Meta webhook payloads contain only a leadgen_id — the actual form fields
 * (name, phone, email) must be fetched from the Graph API before we can
 * process the lead. Returns null on any network or API error so the caller
 * can create a placeholder lead without blocking the webhook pipeline.
 */
async function fetchMetaLeadFields(rawData: Record<string, unknown>): Promise<MetaLeadFields | null> {
  const leadgenId      = rawData['leadgenId'] as string | undefined;
  const pageAccessToken = rawData['pageAccessToken'] as string | undefined;

  if (!leadgenId || !pageAccessToken) return null;

  let json: { field_data?: { name: string; values: string[] }[]; error?: { message: string } };
  try {
    const url = `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${encodeURIComponent(pageAccessToken)}&fields=field_data,created_time`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    json = await res.json() as typeof json;
  } catch {
    // Network timeout or JSON parse failure — not retryable here
    return null;
  }

  if (json.error || !json.field_data) return null;

  // Build a flat map of field_name → first value
  const f: Record<string, string> = {};
  for (const entry of json.field_data) {
    f[entry.name] = entry.values[0] ?? '';
  }

  // Facebook forms use different field names depending on the form template
  const fullName = f['full_name']
    ?? (f['first_name'] ? `${f['first_name']} ${f['last_name'] ?? ''}`.trim() : null)
    ?? f['name']
    ?? null;

  const phone = f['phone_number'] ?? f['phone'] ?? f['mobile_number'] ?? f['mobile'] ?? null;

  return {
    name:    fullName,
    phone:   phone,
    email:   f['email'] ?? f['email_address'] ?? null,
    city:    f['city'] ?? f['city_name'] ?? null,
    state:   f['state'] ?? f['state_name'] ?? null,
    pincode: f['zip_code'] ?? f['pincode'] ?? f['postal_code'] ?? null,
  };
}

// ─── Territory routing ────────────────────────────────────────────────────────

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

// ─── Business hours helpers ───────────────────────────────────────────────────

function isBusinessHours(): boolean {
  const now = new Date();
  const istHour = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
  return istHour >= BUSINESS_HOURS_START && istHour < BUSINESS_HOURS_END;
}

// L1: Fixed — computes UTC equivalent of IST BUSINESS_HOURS_START correctly.
// IST 09:00 = UTC 03:30; subtract 5h30m (330 min) from the IST hour in minutes.
function msUntilNextBusinessHour(): number {
  const nowMs  = Date.now();
  const nowIst = new Date(nowMs + IST_OFFSET_MS);

  const utcMinutes = (BUSINESS_HOURS_START * 60 - 330 + 1440) % 1440;
  const target = new Date(Date.UTC(
    nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate(),
    Math.floor(utcMinutes / 60), utcMinutes % 60, 0, 0,
  ));

  if (target.getTime() <= nowMs) {
    target.setUTCDate(target.getUTCDate() + 1);
  }

  return target.getTime() - nowMs;
}

// ─── Payload ──────────────────────────────────────────────────────────────────

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

// ─── Main worker ──────────────────────────────────────────────────────────────

export async function processLeadIngest(job: Job<LeadIngestPayload>): Promise<void> {
  const { tenantId: rawTenantId, sourceType, sourceId, externalId,
    utmSource, utmMedium, utmCampaign, utmContent, utmTerm, rawData } = job.data;

  // Mutable so Meta enrichment can overwrite the placeholder values from the webhook
  let name    = job.data.name;
  let phone   = job.data.phone;
  let email   = job.data.email;
  let city    = job.data.city;
  let pincode = job.data.pincode;

  // ── L2: Meta Graph API enrichment ──────────────────────────────────────────
  // Meta webhooks carry only a leadgen_id — real contact fields must be fetched
  // from the Graph API before any downstream step (DND, dedup, territory routing)
  // can run correctly. This must happen first.
  if (sourceType === 'META' && !phone) {
    const enriched = await fetchMetaLeadFields(rawData);
    if (enriched) {
      name    = enriched.name    ?? name;
      phone   = enriched.phone   ?? '';
      email   = enriched.email   ?? email;
      city    = enriched.city    ?? city;
      pincode = enriched.pincode ?? pincode;
      await job.log(`Meta enrichment OK: name=${name}, phone=${phone ? '[present]' : '[empty]'}, city=${city ?? 'n/a'}`);
    } else {
      await job.log('Meta enrichment failed (network error, expired token, or missing fields) — lead will be created without phone and skipped for dialling');
    }
  }

  // ── Territory routing (now has real pincode from Meta if available) ─────────
  const tenantId = await resolveLeadTenant(rawTenantId, pincode);
  if (tenantId !== rawTenantId) {
    await job.log(`Territory routing: pincode=${pincode} matched franchise tenant=${tenantId}`);
  }

  // ── DND check (now has real phone from Meta) ────────────────────────────────
  // dnd_list has no RLS — safe to query directly
  const dnd = phone ? await prisma.dndList.findFirst({ where: { phone } }) : null;
  if (dnd) {
    await job.log(`Phone ${phone} is on DND list, skipping voice dial`);
  }

  // ── Dedup + create lead (now with real name/phone/email) ───────────────────
  const lead = await withSystemContext(prisma, tenantId, async (tx) => {
    // Deduplicate by phone within tenant — only check if we have a real phone
    if (phone) {
      const existing = await tx.lead.findFirst({
        where: { tenantId, phone },
        select: { id: true },
      });
      if (existing) {
        await job.log(`Duplicate lead phone=${phone} tenant=${tenantId}, skipping`);
        return null;
      }
    }

    const created = await tx.lead.create({
      data: {
        tenantId,
        name,
        phone,
        phoneRaw: phone,
        email:      email   ?? null,
        city:       city    ?? null,
        stage:      'NEW',
        sourceType,
        sourceId:   sourceId   ?? null,
        externalId: externalId ?? null,
        rawPayload: rawData as object,
        pincode:    pincode    ?? null,
        utmSource:  utmSource  ?? null,
        utmMedium:  utmMedium  ?? null,
        utmCampaign: utmCampaign ?? null,
        utmContent: utmContent ?? null,
        utmTerm:    utmTerm    ?? null,
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
      city:    city    ?? null,
      sourceType,
    });

    return created;
  });

  if (!lead) return;

  // ── L4: Respect the global AI-dial kill-switch ──────────────────────────────
  if (!env.ENABLE_AI_DIAL) {
    await job.log('AI dialing disabled (ENABLE_AI_DIAL=false), skipping voice-dial enqueue');
    return;
  }

  // Leads without a phone (Meta enrichment failed) are created for CRM visibility
  // but cannot be dialled. The voice-dial worker also guards this (L3), but we
  // skip enqueueing here to keep the queue clean.
  if (!phone) {
    await job.log(`Lead ${lead.id} has no phone — skipping voice-dial enqueue`);
    return;
  }

  if (!dnd && isBusinessHours()) {
    await queues.voiceDial.add(
      'voice-dial',
      { leadId: lead.id, tenantId, personaId: 'EXCESS_AGENT' },
      { delay: 0, priority: 1 },
    );
  } else if (!dnd) {
    await queues.voiceDial.add(
      'voice-dial',
      { leadId: lead.id, tenantId, personaId: 'EXCESS_AGENT' },
      { delay: msUntilNextBusinessHour(), priority: 2 },
    );
  }
}
