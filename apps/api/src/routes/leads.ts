import Anthropic from '@anthropic-ai/sdk';
import type { FastifyPluginAsync } from 'fastify';
import type { LeadSourceType, LeadStage, ActivityType } from '@excess/db';
import { can } from '@excess/shared';
import { enrollLeadInSequences } from '../lib/sequences.js';
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

const anthropic = new Anthropic();

function generateProjectNumber(): string {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `PRJ-${yyyymm}-${hex}`;
}

export const leadsRoutes: FastifyPluginAsync = async (app) => {
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
      const [totalLeads, newToday, callsToday, converted, newYesterday, callsYesterday] =
        await Promise.all([
          tx.lead.count({ where: { tenantId } }),
          tx.lead.count({ where: { tenantId, createdAt: { gte: today } } }),
          tx.call.count({ where: { tenantId, initiatedAt: { gte: today } } }),
          tx.lead.count({ where: { tenantId, stage: 'CONVERTED' } }),
          tx.lead.count({ where: { tenantId, createdAt: { gte: yesterday, lt: yesterdayCutoff } } }),
          tx.call.count({ where: { tenantId, initiatedAt: { gte: yesterday, lt: yesterdayCutoff } } }),
        ]);
      return { totalLeads, newToday, callsToday, converted, newYesterday, callsYesterday };
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
      },
    });
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

    const { stage, factSheet, notes, dealValueInr } = parsed.data;

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
        select: { id: true, stage: true, tenantId: true },
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

    if (stage === 'CONVERTED' && dealValueInr !== undefined) {
      await app.queues.commissionCalc.add('commission-calc', {
        leadId: id,
        tenantId: req.auth.tenantId,
        dealValueInr,
      });
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

    return reply.send({ data: lead });
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

    await app.queues.leadIngest.add('lead-ingest', {
      sourceType: 'MANUAL',
      tenantId: req.auth.tenantId,
      name,
      phone,
      email,
      city,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      rawData: { createdBy: req.auth.userId },
    });

    return reply.code(202).send({ data: { queued: true } });
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

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const summary = message.content[0]?.type === 'text' ? message.content[0].text : 'Summary unavailable.';
    const result = { summary, generatedAt: new Date().toISOString() };

    await app.redis.setex(cacheKey, 3600, JSON.stringify(result));
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId: id }, 'lead.summary_generated');

    return reply.send({ data: result });
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
};
