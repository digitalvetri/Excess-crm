import { createHmac } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { LeadSourceType, LeadStage, ActivityType } from '@excess/db';
import { can, scoreLead, scoreLabel, computeCommission } from '@excess/shared';
import { fireWebhooks } from '../lib/fire-webhook.js';
import { fireGoogleAdsConversion } from '../lib/google-ads-conversion.js';
import { notifyUser } from '../lib/notify-user.js';
import { prisma, withSystemContext } from '@excess/db';
import { enrollLeadInSequences } from '../lib/sequences.js';
import { llmComplete } from '../lib/llm.js';
import { env } from '@excess/config';
import {
  updateLeadSchema,
  assignLeadSchema,
  leadFiltersSchema,
  bulkLeadActionSchema,
  updateLeadTagsSchema,
  mergeLeadSchema,
  createSavedViewSchema,
  createManualLeadSchema,
} from '@excess/shared';

function generateProjectNumber(): string {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `PRJ-${yyyymm}-${hex}`;
}

export const leadsRoutes: FastifyPluginAsync = async (app) => {
  // POST /leads/refer — PUBLIC referral landing page submission (no auth)
  app.post('/refer', { config: { public: true, rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = req.body as {
      name?: unknown;
      phone?: unknown;
      city?: unknown;
      referralToken?: unknown;
    };

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const city = typeof body.city === 'string' ? body.city.trim() : null;
    const referralToken = typeof body.referralToken === 'string' ? body.referralToken.trim() : '';

    if (!name || !phone || !referralToken) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'name, phone, and referralToken are required' } });
    }
    if (!/^\d{10}$/.test(phone)) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'phone must be a 10-digit number' } });
    }

    // Token format: ${leadId}-${hmac16}
    const dashIdx = referralToken.lastIndexOf('-');
    if (dashIdx < 0) {
      return reply.code(400).send({ error: { code: 'invalid_token', message: 'Invalid referral token' } });
    }
    const leadId = referralToken.substring(0, dashIdx);
    const hmac = referralToken.substring(dashIdx + 1);

    const expected = createHmac('sha256', env.SESSION_SECRET).update(leadId).digest('hex').substring(0, 16);
    if (expected !== hmac) {
      return reply.code(400).send({ error: { code: 'invalid_token', message: 'Invalid referral token' } });
    }

    // Look up referrer to get tenantId
    const referrer = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { tenantId: true, name: true },
    });
    if (!referrer) {
      return reply.code(400).send({ error: { code: 'invalid_token', message: 'Invalid referral token' } });
    }

    const { tenantId, name: referrerName } = referrer;

    // Dedup check
    const existing = await withSystemContext(prisma, tenantId, (tx) =>
      tx.lead.findFirst({ where: { tenantId, phone }, select: { id: true } }),
    );
    if (existing) {
      return reply.send({ data: { message: 'Thank you! We will call you shortly.' } });
    }

    const newLead = await withSystemContext(prisma, tenantId, async (tx) => {
      const created = await tx.lead.create({
        data: {
          tenantId,
          name,
          phone,
          phoneRaw: phone,
          city: city || null,
          stage: 'NEW',
          sourceType: 'WEBSITE' as LeadSourceType,
          rawPayload: { referredBy: referrerName, referralLeadId: leadId } as object,
        },
      });

      await tx.referral.create({
        data: {
          tenantId,
          referrerId: leadId,
          referredLeadId: created.id,
          status: 'PENDING',
        },
      });

      return created;
    });

    // Enqueue voice dial if AI dial is enabled
    if (env.ENABLE_AI_DIAL) {
      await app.queues.voiceDial.add('voice-dial', {
        leadId: newLead.id,
        tenantId,
        personaId: 'EXCESS_AGENT',
      });
    }

    req.log.info({ tenantId, leadId: newLead.id, referrerId: leadId }, 'referral.lead_created');

    return reply.send({ data: { message: 'Thank you! We will call you shortly.' } });
  });

  // GET /leads — list with filters + cursor pagination
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.own')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = leadFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid filters' } });
    }

    const {
      stage,
      source,
      cursor,
      limit = 25,
      search,
      ownerId,
      dateFrom,
      dateTo,
      city,
      sort = 'createdAt',
      order = 'desc',
      commsOptedOut,
    } = parsed.data;

    const canReadAll = can(req.auth.role, 'leads.read.all');
    const canReadTeam = can(req.auth.role, 'leads.read.team');

    const leads = await req.withTenant((tx) =>
      tx.lead.findMany({
        where: {
          tenantId: req.auth.tenantId,
          ...(stage && { stage: { in: (Array.isArray(stage) ? stage : [stage]) as LeadStage[] } }),
          ...(source && { sourceType: source as LeadSourceType }),
          ...(city && { city: { contains: city, mode: 'insensitive' as const } }),
          ...(search && {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }),
          ...(ownerId && { ownerUserId: ownerId }),
          ...(!canReadAll && !canReadTeam && { ownerUserId: req.auth.userId }),
          ...(dateFrom || dateTo
            ? {
                createdAt: {
                  ...(dateFrom && { gte: new Date(dateFrom) }),
                  ...(dateTo && { lte: new Date(dateTo) }),
                },
              }
            : {}),
          ...(cursor && { id: { lt: cursor } }),
          ...(commsOptedOut === 'true'  && { commsOptedOutAt: { not: null } }),
          ...(commsOptedOut === 'false' && { commsOptedOutAt: null }),
        },
        take: limit + 1,
        orderBy: { [sort]: order },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          city: true,
          stage: true,
          sourceType: true,
          aiScore: true,
          aiScoreBreakdown: true,
          tags: true,
          isDuplicate: true,
          duplicateOfId: true,
          ownerUserId: true,
          createdAt: true,
          stageChangedAt: true,
        },
      }),
    );

    const hasMore = leads.length > limit;
    if (hasMore) leads.pop();

    return reply.send({
      data: {
        leads,
        nextCursor: hasMore ? (leads[leads.length - 1]?.id ?? null) : null,
        hasMore,
      },
    });
  });

  // GET /leads/stats — dashboard counts
  app.get('/stats', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.own')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    // Compare like-for-like: yesterday only up to the current time of day,
    // so an early-morning "0 today" isn't shown as a -100% crash vs a full day.
    const yesterdayCutoff = new Date(yesterday.getTime() + (now.getTime() - today.getTime()));

    const stats = await req.withTenant(async (tx) => {
      const tenantId = req.auth.tenantId;
      const [totalLeads, newToday, callsToday, converted, newYesterday, callsYesterday, byStageRaw] =
        await Promise.all([
          tx.lead.count({ where: { tenantId } }),
          tx.lead.count({ where: { tenantId, createdAt: { gte: today } } }),
          tx.call.count({ where: { tenantId, initiatedAt: { gte: today } } }),
          tx.lead.count({ where: { tenantId, stage: 'CONVERTED' } }),
          tx.lead.count({ where: { tenantId, createdAt: { gte: yesterday, lt: yesterdayCutoff } } }),
          tx.call.count({ where: { tenantId, initiatedAt: { gte: yesterday, lt: yesterdayCutoff } } }),
          tx.lead.groupBy({ by: ['stage'], where: { tenantId }, _count: { _all: true } }),
        ]);
      const byStage: Record<string, number> = {};
      for (const row of byStageRaw) byStage[row.stage] = row._count._all;
      return { totalLeads, newToday, callsToday, converted, newYesterday, callsYesterday, byStage };
    });

    const conversionRate =
      stats.totalLeads > 0 ? Math.round((stats.converted / stats.totalLeads) * 100) : 0;

    return reply.send({
      data: {
        totalLeads: stats.totalLeads,
        newToday: stats.newToday,
        callsToday: stats.callsToday,
        conversionRate,
        converted: stats.converted,
        newYesterday: stats.newYesterday,
        callsYesterday: stats.callsYesterday,
        byStage: stats.byStage,
      },
    });
  });

  // GET /leads/export — CSV download (max 5000)
  app.get('/export', async (req, reply) => {
    if (!can(req.auth.role, 'leads.export')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const canReadAll = can(req.auth.role, 'leads.read.all');
    const leads = await req.withTenant((tx) =>
      tx.lead.findMany({
        where: {
          tenantId: req.auth.tenantId,
          ...(!canReadAll && { ownerUserId: req.auth.userId }),
        },
        select: {
          id: true, name: true, phone: true, email: true, city: true, state: true,
          pincode: true, stage: true, sourceType: true, aiScore: true, tags: true,
          ownerUserId: true, isDuplicate: true, createdAt: true, stageChangedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
    );

    const header = ['ID','Name','Phone','Email','City','State','Pincode','Stage','Source','AI Score','Tags','Duplicate','Created At','Stage Changed At'];
    const rows = leads.map((l) => [
      l.id, l.name, l.phone, l.email ?? '', l.city ?? '', l.state ?? '', l.pincode ?? '',
      l.stage, l.sourceType, l.aiScore != null ? String(l.aiScore) : '',
      l.tags.join(';'), l.isDuplicate ? 'yes' : 'no',
      new Date(l.createdAt).toISOString(), new Date(l.stageChangedAt).toISOString(),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    void reply.header('Content-Type', 'text/csv; charset=utf-8');
    void reply.header('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0,10)}.csv"`);
    return reply.send(csv);
  });

  // GET /leads/colony-clusters — group leads by pincode, return heat-map data
  app.get('/colony-clusters', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.all')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const raw = await req.withTenant(async (tx) => {
      return tx.lead.findMany({
        where: { pincode: { not: null } },
        select: { pincode: true, stage: true, city: true },
      });
    });

    type StageKey = string;
    type ClusterMap = Map<string, { pincode: string; city: string | null; stages: Record<StageKey, number>; total: number }>;

    const clusters: ClusterMap = new Map();
    for (const lead of raw) {
      const pin = lead.pincode!;
      if (!clusters.has(pin)) {
        clusters.set(pin, { pincode: pin, city: lead.city, stages: {}, total: 0 });
      }
      const c = clusters.get(pin)!;
      c.stages[lead.stage] = (c.stages[lead.stage] ?? 0) + 1;
      c.total += 1;
    }

    const result = [...clusters.values()].map((c) => {
      const converted = c.stages['CONVERTED'] ?? 0;
      const qualified = c.stages['QUALIFIED'] ?? 0;
      const colonyScore = c.total === 0 ? 0 : Math.round(((converted + qualified * 0.5) / c.total) * 100);
      return { ...c, colonyScore };
    }).sort((a, b) => b.total - a.total);

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, clusters: result.length }, 'leads.colony_clusters');
    return reply.send({ data: result });
  });

  // GET /leads/:id — single lead with activities
  app.get('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.own')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };

    const lead = await req.withTenant((tx) =>
      tx.lead.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          city: true,
          state: true,
          pincode: true,
          stage: true,
          sourceType: true,
          campaignName: true,
          adName: true,
          language: true,
          aiScore: true,
          aiScoreBreakdown: true,
          factSheet: true,
          tags: true,
          isDuplicate: true,
          duplicateOfId: true,
          ownerUserId: true,
          teamId: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          utmContent: true,
          utmTerm: true,
          receivedAt: true,
          firstContactedAt: true,
          stageChangedAt: true,
          createdAt: true,
          updatedAt: true,
          activities: {
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
          calls: {
            orderBy: { initiatedAt: 'desc' },
            take: 20,
            select: {
              id: true,
              status: true,
              persona: true,
              direction: true,
              durationSec: true,
              initiatedAt: true,
              connectedAt: true,
              endedAt: true,
            },
          },
        },
      }),
    );

    if (!lead) {
      return reply.code(404).send({ error: { code: 'leads.not_found', message: 'Lead not found' } });
    }

    return reply.send({ data: lead });
  });

  // PATCH /leads/:id — update stage / fact sheet
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'leads.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = updateLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { stage, factSheet, notes, dealValueInr, systemKw } = parsed.data;

    // Stage gate validation — check before updating
    if (stage) {
      const gateError = await req.withTenant(async (tx) => {
        const gate = await tx.stageGate.findFirst({
          where: { tenantId: req.auth.tenantId, stage: stage as LeadStage, isActive: true },
        });
        if (!gate) return null;

        const requiredFields = (gate.requiredFields as string[]) ?? [];
        const requiredActivityTypes = gate.requiredActivityTypes ?? [];

        if (requiredFields.length > 0 || requiredActivityTypes.length > 0) {
          const lead = await tx.lead.findUnique({
            where: { id },
            select: { email: true, city: true, pincode: true, factSheet: true },
          });
          if (!lead) return null;

          // Check required fields
          for (const field of requiredFields) {
            const value = lead[field as keyof typeof lead];
            if (value === null || value === undefined || value === '') {
              return `Field "${field}" is required before moving to ${stage.replace(/_/g, ' ')}`;
            }
          }

          // Check required activities
          for (const actType of requiredActivityTypes) {
            const exists = await tx.leadActivity.findFirst({
              where: { leadId: id, tenantId: req.auth.tenantId, type: actType as ActivityType },
              select: { id: true },
            });
            if (!exists) {
              return `A "${actType.replace(/_/g, ' ')}" activity is required before moving to ${stage.replace(/_/g, ' ')}`;
            }
          }
        }
        return null;
      });

      if (gateError) {
        return reply.code(422).send({
          error: { code: 'stage_gate.blocked', message: gateError },
        });
      }
    }

    const lead = await req.withTenant(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: {
          ...(stage && { stage, stageChangedAt: new Date() }),
          ...(factSheet && { factSheet: factSheet as object }),
        },
        select: { id: true, stage: true, tenantId: true, phone: true, createdAt: true },
      });

      if (notes) {
        await tx.leadActivity.create({
          data: {
            leadId: id,
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            type: 'NOTE',
            payload: { note: notes } as object,
          },
        });
      }

      if (stage) {
        await tx.leadActivity.create({
          data: {
            leadId: id,
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            type: 'STAGE_CHANGE',
            payload: { newStage: stage } as object,
          },
        });
        await enrollLeadInSequences(tx, req.auth.tenantId, id, 'LEAD_STAGE', stage);
      }

      return updated;
    });

    // Create the franchise commission SYNCHRONOUSLY on conversion (no worker
    // dependency) so it shows up for the franchise and the admin immediately.
    // Franchise rule: ₹1,500 per kW; falls back to the slab % model on deal value.
    // The outcome is returned to the client so the convert UI can report exactly
    // what happened (created / not a franchise tenant / no value / already exists).
    let commissionOutcome:
      | { created: true; netPayableInr: number }
      | { created: false; reason: 'not_franchise' | 'no_value' | 'already_exists' | 'error' }
      | undefined;
    if (stage === 'CONVERTED') {
      try {
        commissionOutcome = await req.withTenant(async (tx) => {
          const tenant = await tx.tenant.findUnique({
            where: { id: req.auth.tenantId },
            select: { type: true, commissionSlabs: true },
          });
          if (!tenant || tenant.type !== 'FRANCHISE') {
            return { created: false as const, reason: 'not_franchise' as const }; // commissions are franchise-only
          }

          const existing = await tx.commission.findFirst({ where: { leadId: id, tenantId: req.auth.tenantId } });
          if (existing) return { created: false as const, reason: 'already_exists' as const }; // idempotent

          if (systemKw === undefined && dealValueInr === undefined) {
            return { created: false as const, reason: 'no_value' as const };
          }

          const slabs = (tenant.commissionSlabs ?? {}) as Record<string, number>;
          const c = computeCommission(slabs, dealValueInr ?? 0, systemKw);

          const created = await tx.commission.create({
            data: {
              tenantId:      req.auth.tenantId,
              leadId:        id,
              dealValueInr:  dealValueInr ?? 0,
              ratePercent:   c.ratePercent,
              commissionInr: c.commissionInr,
              gstInr:        c.gstInr,
              netPayableInr: c.netPayableInr,
              status:        'PENDING_APPROVAL',
            },
            select: { netPayableInr: true },
          });
          return { created: true as const, netPayableInr: Number(created.netPayableInr) };
        });
        req.log.info({ tenantId: req.auth.tenantId, leadId: id, systemKw, commissionOutcome }, 'commission.outcome');
      } catch (err) {
        req.log.error({ tenantId: req.auth.tenantId, leadId: id, err }, 'commission.create_failed');
        commissionOutcome = { created: false, reason: 'error' };
      }
    }

    // Auto-create install Project when a lead converts (one per lead)
    if (stage === 'CONVERTED') {
      try {
        await req.withTenant(async (tx) => {
          const existing = await tx.project.findUnique({
            where: { leadId: id },
            select: { id: true },
          });
          if (existing) return;

          const quotation = await tx.quotation.findFirst({
            where: { leadId: id },
            orderBy: { createdAt: 'desc' },
            select: { id: true, systemKw: true, totalInr: true },
          });
          const surveyAppt = await tx.appointment.findFirst({
            where: { leadId: id, status: 'COMPLETED' },
            orderBy: { scheduledAt: 'desc' },
            select: { id: true },
          });

          await tx.project.create({
            data: {
              tenantId: req.auth.tenantId,
              leadId: id,
              number: generateProjectNumber(),
              ...(quotation && {
                quotationId: quotation.id,
                systemKw: quotation.systemKw,
                totalValueInr: quotation.totalInr,
              }),
              ...(surveyAppt && { surveyAppointmentId: surveyAppt.id }),
            },
          });
        });
        req.log.info({ tenantId: req.auth.tenantId, leadId: id }, 'project.auto_created');
      } catch (err) {
        req.log.error({ tenantId: req.auth.tenantId, leadId: id, err }, 'project.auto_create_failed');
      }
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId: id, stage }, 'lead.updated');
    if (stage) {
      void fireWebhooks(prisma, req.auth.tenantId, 'lead.stage_changed', { leadId: id, stage });
      if (stage === 'CONVERTED') {
        void notifyUser(prisma, {
          tenantId: req.auth.tenantId,
          userId: req.auth.userId,
          type: 'lead.converted',
          title: 'Lead converted!',
          body: `Lead ${id} has been marked as converted.`,
          linkHref: `/leads/${id}`,
        });
        void fireGoogleAdsConversion({ id, phone: lead.phone, createdAt: lead.createdAt });
      }
    }

    return reply.send({ data: lead, meta: { commission: commissionOutcome } });
  });

  // PATCH /leads/:id/assign
  app.patch('/:id/assign', async (req, reply) => {
    if (!can(req.auth.role, 'leads.assign')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = assignLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }

    const lead = await req.withTenant(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: { ownerUserId: parsed.data.userId },
        select: { id: true, ownerUserId: true },
      });

      await tx.leadActivity.create({
        data: {
          leadId: id,
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          type: 'ASSIGNMENT',
          payload: { assignedTo: parsed.data.userId } as object,
        },
      });

      return updated;
    });

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId: id }, 'lead.assigned');
    void fireWebhooks(prisma, req.auth.tenantId, 'lead.assigned', { leadId: id, userId: parsed.data.userId });
    if (parsed.data.userId && parsed.data.userId !== req.auth.userId) {
      void notifyUser(prisma, {
        tenantId: req.auth.tenantId,
        userId: parsed.data.userId,
        type: 'lead.assigned',
        title: 'Lead assigned to you',
        body: `A lead has been assigned to you.`,
        linkHref: `/leads/${id}`,
      });
    }
    return reply.send({ data: lead });
  });

  // POST /leads/bulk — bulk stage change / assign
  app.post('/bulk', async (req, reply) => {
    if (!can(req.auth.role, 'leads.bulk')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = bulkLeadActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }

    const { ids, action, value } = parsed.data;

    if (action === 'stage') {
      await req.withTenant((tx) =>
        tx.lead.updateMany({
          where: { id: { in: ids }, tenantId: req.auth.tenantId },
          data: { stage: value as never, stageChangedAt: new Date() },
        }),
      );
    } else if (action === 'assign') {
      await req.withTenant((tx) =>
        tx.lead.updateMany({
          where: { id: { in: ids }, tenantId: req.auth.tenantId },
          data: { ownerUserId: value },
        }),
      );
    } else if (action === 'tag') {
      const newTags = value.split(',').map((t: string) => t.trim()).filter(Boolean);
      if (newTags.length > 0) {
        const existing = await req.withTenant((tx) =>
          tx.lead.findMany({
            where: { id: { in: ids }, tenantId: req.auth.tenantId },
            select: { id: true, tags: true },
          }),
        );
        await req.withTenant((tx) =>
          Promise.all(
            existing.map((l) =>
              tx.lead.update({
                where: { id: l.id },
                data: { tags: [...new Set([...l.tags, ...newTags])] },
              }),
            ),
          ),
        );
      }
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, count: ids.length, action }, 'leads.bulk_action');
    return reply.send({ data: { updated: ids.length } });
  });

  // POST /leads — manual lead creation
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'leads.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createManualLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { name, phone, email, city, utmSource, utmMedium, utmCampaign, utmContent, utmTerm } = parsed.data;

    // Insert synchronously (not via the lead-ingest queue) so a manually-added
    // lead is visible immediately and never depends on the worker being up. It's
    // owned by the creator so franchise users (who only see their own leads) see
    // it right away.
    const lead = await req.withTenant(async (tx) => {
      const dup = await tx.lead.findFirst({
        where: { tenantId: req.auth.tenantId, phone },
        select: { id: true },
      });

      const created = await tx.lead.create({
        data: {
          tenantId:   req.auth.tenantId,
          sourceType: 'MANUAL',
          name,
          phone,
          phoneRaw:   phone,
          ...(email && { email }),
          ...(city && { city }),
          ...(utmSource && { utmSource }),
          ...(utmMedium && { utmMedium }),
          ...(utmCampaign && { utmCampaign }),
          ...(utmContent && { utmContent }),
          ...(utmTerm && { utmTerm }),
          stage:       'NEW',
          ownerUserId: req.auth.userId,
          isDuplicate: dup != null,
          ...(dup && { duplicateOfId: dup.id }),
          rawPayload:  { createdBy: req.auth.userId, manual: true } as object,
        },
      });

      await tx.leadActivity.create({
        data: {
          leadId:      created.id,
          tenantId:    req.auth.tenantId,
          actorUserId: req.auth.userId,
          actorIsAi:   false,
          type:        'NOTE',
          payload:     { note: 'Lead added manually' } as object,
        },
      });

      return created;
    });

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId: lead.id }, 'lead.created_manual');
    void fireWebhooks(prisma, req.auth.tenantId, 'lead.created', { leadId: lead.id, sourceType: 'MANUAL' });
    return reply.code(201).send({ data: lead });
  });

  // PATCH /leads/:id/tags
  app.patch('/:id/tags', async (req, reply) => {
    if (!can(req.auth.role, 'leads.tag')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { id } = req.params as { id: string };
    const parsed = updateLeadTagsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }
    const lead = await req.withTenant((tx) =>
      tx.lead.update({
        where: { id },
        data: { tags: parsed.data.tags },
        select: { id: true, tags: true },
      }),
    );
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId: id }, 'lead.tags_updated');
    return reply.send({ data: lead });
  });

  // POST /leads/:id/reopt-in — clear commsOptedOutAt so lead can receive comms again
  app.post('/:id/reopt-in', async (req, reply) => {
    if (!can(req.auth.role, 'leads.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { id } = req.params as { id: string };
    const existing = await req.withTenant((tx) =>
      tx.lead.findUnique({ where: { id }, select: { id: true, commsOptedOutAt: true } }),
    );
    if (!existing) {
      return reply.code(404).send({ error: { code: 'leads.not_found', message: 'Lead not found' } });
    }
    if (!existing.commsOptedOutAt) {
      return reply.code(409).send({ error: { code: 'leads.not_opted_out', message: 'Lead is not opted out' } });
    }
    await req.withTenant((tx) =>
      tx.lead.update({ where: { id }, data: { commsOptedOutAt: null } }),
    );
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId: id }, 'lead.reopt_in');
    return reply.send({ data: { id, commsOptedOutAt: null } });
  });

  // GET /leads/:id/duplicates
  app.get('/:id/duplicates', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.own')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { id } = req.params as { id: string };
    const lead = await req.withTenant((tx) =>
      tx.lead.findUnique({ where: { id }, select: { phone: true } }),
    );
    if (!lead) {
      return reply.code(404).send({ error: { code: 'leads.not_found', message: 'Lead not found' } });
    }
    const duplicates = await req.withTenant((tx) =>
      tx.lead.findMany({
        where: {
          phone: lead.phone,
          id: { not: id },
          tenantId: req.auth.tenantId,
        },
        select: {
          id: true,
          name: true,
          phone: true,
          stage: true,
          sourceType: true,
          createdAt: true,
          isDuplicate: true,
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    );
    return reply.send({ data: duplicates });
  });

  // POST /leads/:id/merge
  app.post('/:id/merge', async (req, reply) => {
    if (!can(req.auth.role, 'leads.merge')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { id: masterId } = req.params as { id: string };
    const parsed = mergeLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }
    const { duplicateId } = parsed.data;

    await req.withTenant(async (tx) => {
      await tx.leadActivity.updateMany({
        where: { leadId: duplicateId, tenantId: req.auth.tenantId },
        data: { leadId: masterId },
      });
      await tx.call.updateMany({
        where: { leadId: duplicateId, tenantId: req.auth.tenantId },
        data: { leadId: masterId },
      });
      await tx.appointment.updateMany({
        where: { leadId: duplicateId, tenantId: req.auth.tenantId },
        data: { leadId: masterId },
      });
      await tx.lead.update({
        where: { id: duplicateId },
        data: { isDuplicate: true, duplicateOfId: masterId, stage: 'INVALID' },
      });
      await tx.leadActivity.create({
        data: {
          leadId: masterId,
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          type: 'NOTE',
          payload: { note: `Merged duplicate lead ${duplicateId}` } as object,
        },
      });
    });

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, masterId, duplicateId }, 'lead.merged');
    return reply.send({ data: { merged: true } });
  });

  // GET /leads/:id/summary — AI summary via Claude Haiku
  app.get('/:id/summary', async (req, reply) => {
    if (!can(req.auth.role, 'leads.summarize')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { id } = req.params as { id: string };

    const cacheKey = `lead_summary:${req.auth.tenantId}:${id}`;
    const cached = await app.redis.get(cacheKey);
    if (cached) {
      return reply.send({ data: JSON.parse(cached) as unknown });
    }

    const lead = await req.withTenant((tx) =>
      tx.lead.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          phone: true,
          city: true,
          stage: true,
          sourceType: true,
          aiScore: true,
          factSheet: true,
          createdAt: true,
          activities: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { type: true, payload: true, createdAt: true, actorIsAi: true },
          },
          calls: {
            orderBy: { initiatedAt: 'desc' },
            take: 10,
            select: { status: true, durationSec: true, persona: true, initiatedAt: true },
          },
        },
      }),
    );

    if (!lead) {
      return reply.code(404).send({ error: { code: 'leads.not_found', message: 'Lead not found' } });
    }

    const prompt = `You are a CRM assistant for Excess Renew, a solar company in Coimbatore, India.
Summarize this lead in 3-4 concise bullet points covering: intent/interest level, engagement history, key facts from fact sheet, and recommended next action.

Lead: ${lead.name}, ${lead.city ?? 'unknown city'}, Stage: ${lead.stage}, Source: ${lead.sourceType}, AI Score: ${lead.aiScore ?? 'N/A'}
Fact Sheet: ${JSON.stringify(lead.factSheet ?? {})}
Recent Activities (${lead.activities.length}): ${JSON.stringify(lead.activities.slice(0, 5))}
Calls (${lead.calls.length}): ${JSON.stringify(lead.calls.slice(0, 5))}

Respond in English. Be brief and actionable.`;

    const summaryText = await llmComplete(prompt, { maxTokens: 300 });
    const summary = summaryText ?? 'AI summary is unavailable right now. Please try again shortly.';
    const result = { summary, generatedAt: new Date().toISOString() };

    // Only cache real summaries — never cache the fallback string for an hour.
    if (summaryText) {
      await app.redis.setex(cacheKey, 3600, JSON.stringify(result));
    }
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId: id }, 'lead.summary_generated');

    return reply.send({ data: result });
  });

  // POST /leads/:id/draft-reply — AI-drafted WhatsApp/email reply (a suggestion the
  // rep edits and sends; never sent autonomously). Built on the shared Groq helper.
  app.post('/:id/draft-reply', async (req, reply) => {
    if (!can(req.auth.role, 'leads.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { id } = req.params as { id: string };
    const rawChannel = (req.body as { channel?: string } | null)?.channel;
    const channel: 'whatsapp' | 'email' = rawChannel === 'email' ? 'email' : 'whatsapp';

    const lead = await req.withTenant((tx) =>
      tx.lead.findUnique({
        where: { id },
        select: {
          name: true, city: true, stage: true, language: true, factSheet: true,
          activities: {
            where: { type: { in: ['WHATSAPP', 'NOTE', 'EMAIL', 'CALL'] } },
            orderBy: { createdAt: 'desc' },
            take: 12,
            select: { type: true, payload: true, actorIsAi: true },
          },
        },
      }),
    );
    if (!lead) {
      return reply.code(404).send({ error: { code: 'leads.not_found', message: 'Lead not found' } });
    }

    const history = [...lead.activities]
      .reverse()
      .map((a) => {
        const p = (a.payload ?? {}) as Record<string, unknown>;
        const text = String(p['message'] ?? p['text'] ?? p['body'] ?? p['note'] ?? '').slice(0, 200);
        if (!text) return '';
        const who = a.actorIsAi ? 'Us' : a.type === 'WHATSAPP' || a.type === 'EMAIL' ? 'Customer' : 'Internal';
        return `${who}: ${text}`;
      })
      .filter(Boolean)
      .join('\n');

    const system = `You are a warm, professional sales rep for Excess Renew, a rooftop-solar company in Coimbatore, Tamil Nadu. Write a short ${channel} reply to a customer lead. Match their language (Tamil / English / Tanglish). Keep it 1-3 sentences, friendly and helpful, and move the deal forward — answer their question, offer a free site survey, or suggest the next step. Use the customer's real name. No markdown, no placeholders, never invent prices.`;

    const prompt = `Lead: ${lead.name}${lead.city ? `, ${lead.city}` : ''} · Stage: ${lead.stage} · Language: ${lead.language ?? 'unknown'}
Fact sheet: ${JSON.stringify(lead.factSheet ?? {})}

Conversation so far (oldest first):
${history || '(no prior messages — this is the opener)'}

Write the next ${channel} message to ${lead.name}:`;

    const draft = await llmComplete(prompt, { system, maxTokens: 220, temperature: 0.6 });
    if (!draft) {
      return reply.code(503).send({ error: { code: 'ai.unavailable', message: 'AI drafting is unavailable right now (check GROQ_API_KEY).' } });
    }
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId: id, channel }, 'lead.draft_reply');
    return reply.send({ data: { draft: draft.trim(), channel } });
  });

  // GET /leads/views — list saved views
  app.get('/views', async (req, reply) => {
    if (!can(req.auth.role, 'saved_views.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const views = await req.withTenant((tx) =>
      tx.savedView.findMany({
        where: {
          tenantId: req.auth.tenantId,
          OR: [{ userId: req.auth.userId }, { isShared: true }],
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, icon: true, isShared: true, filters: true, createdAt: true, userId: true },
      }),
    );
    return reply.send({ data: views });
  });

  // POST /leads/views — create saved view
  app.post('/views', async (req, reply) => {
    if (!can(req.auth.role, 'saved_views.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const parsed = createSavedViewSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }
    const view = await req.withTenant((tx) =>
      tx.savedView.create({
        data: {
          tenantId: req.auth.tenantId,
          userId: req.auth.userId,
          name: parsed.data.name,
          filters: parsed.data.filters as object,
          icon: parsed.data.icon ?? null,
          isShared: parsed.data.isShared,
        },
        select: { id: true, name: true, icon: true, isShared: true, filters: true, createdAt: true },
      }),
    );
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, viewId: view.id }, 'saved_view.created');
    return reply.code(201).send({ data: view });
  });

  // DELETE /leads/views/:viewId
  app.delete('/views/:viewId', async (req, reply) => {
    if (!can(req.auth.role, 'saved_views.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { viewId } = req.params as { viewId: string };
    const view = await req.withTenant((tx) =>
      tx.savedView.findUnique({ where: { id: viewId }, select: { userId: true } }),
    );
    if (!view) {
      return reply.code(404).send({ error: { code: 'saved_view.not_found', message: 'View not found' } });
    }
    if (view.userId !== req.auth.userId && !can(req.auth.role, 'leads.read.all')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Cannot delete another user\'s view' } });
    }
    await req.withTenant((tx) => tx.savedView.delete({ where: { id: viewId } }));
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, viewId }, 'saved_view.deleted');
    return reply.code(204).send();
  });

  // POST /leads/:id/email — send email to lead
  app.post('/:id/email', async (req, reply) => {
    if (!can(req.auth.role, 'leads.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { id } = req.params as { id: string };
    const { subject, body } = req.body as { subject?: string; body?: string };
    if (!subject?.trim() || !body?.trim()) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Subject and body are required' } });
    }
    const lead = await req.withTenant((tx) =>
      tx.lead.findUnique({ where: { id }, select: { id: true, name: true, email: true } }),
    );
    if (!lead) return reply.code(404).send({ error: { code: 'leads.not_found', message: 'Lead not found' } });
    if (!lead.email) return reply.code(422).send({ error: { code: 'leads.no_email', message: 'Lead has no email address' } });
    await app.queues.emailSend.add('email-send', {
      tenantId: req.auth.tenantId,
      to: lead.email,
      subject: subject.trim(),
      template: 'CUSTOM_EMAIL',
      vars: { body: body.trim(), leadName: lead.name },
    });
    await req.withTenant((tx) =>
      tx.leadActivity.create({
        data: {
          leadId: id,
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          type: 'EMAIL',
          payload: { subject: subject.trim(), to: lead.email } as object,
        },
      }),
    );
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId: id }, 'lead.email_sent');
    return reply.send({ data: { sent: true } });
  });

  // ── GET /leads/:id/score — compute & persist lead quality score ───────────────
  app.get('/:id/score', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!can(req.auth.role, 'leads.read.own')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    // Uses the shared v2 scorer (same as the daily worker batch) so the persisted
    // aiScore / aiScoreBreakdown is always computed one consistent way.
    const [lead, activities] = await req.withTenant((tx) =>
      Promise.all([
        tx.lead.findUniqueOrThrow({
          where: { id },
          select: {
            id: true, stage: true, email: true, city: true,
            pincode: true, sourceType: true, receivedAt: true,
          },
        }),
        tx.leadActivity.findMany({ where: { leadId: id }, select: { type: true } }),
      ])
    );

    const activityTypes = new Set(activities.map((a) => a.type));
    const { score, breakdown } = scoreLead(lead, activityTypes);
    const { label, color } = scoreLabel(score);

    // Persist so the lead list and detail view reflect the fresh score
    await req.withTenant((tx) =>
      tx.lead.update({
        where: { id },
        data: { aiScore: score, aiScoreBreakdown: breakdown as object, scoredAt: new Date() },
      })
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId: id, score }, 'lead.score_computed');
    return reply.send({ data: { score, label, color, breakdown } });
  });
};
