import type { FastifyPluginAsync } from 'fastify';
import type { LeadSourceType, LeadStage } from '@excess/db';
import { can } from '@excess/shared';
import {
  updateLeadSchema,
  assignLeadSchema,
  leadFiltersSchema,
  bulkLeadActionSchema,
} from '@excess/shared';

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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await req.withTenant(async (tx) => {
      const [totalLeads, newToday, callsToday, converted] = await Promise.all([
        tx.lead.count({ where: { tenantId: req.auth.tenantId } }),
        tx.lead.count({ where: { tenantId: req.auth.tenantId, createdAt: { gte: today } } }),
        tx.call.count({ where: { tenantId: req.auth.tenantId, initiatedAt: { gte: today } } }),
        tx.lead.count({ where: { tenantId: req.auth.tenantId, stage: 'CONVERTED' } }),
      ]);
      return { totalLeads, newToday, callsToday, converted };
    });

    const conversionRate =
      stats.totalLeads > 0 ? Math.round((stats.converted / stats.totalLeads) * 100) : 0;

    return reply.send({
      data: {
        totalLeads: stats.totalLeads,
        newToday: stats.newToday,
        callsToday: stats.callsToday,
        conversionRate,
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
        include: {
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

    const body = req.body as {
      name: string;
      phone: string;
      email?: string;
      city?: string;
    };

    if (!body.name || !body.phone) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'name and phone are required' } });
    }

    await app.queues.leadIngest.add('lead-ingest', {
      sourceType: 'MANUAL',
      tenantId: req.auth.tenantId,
      name: body.name,
      phone: body.phone,
      email: body.email,
      city: body.city,
      rawData: { createdBy: req.auth.userId },
    });

    return reply.code(202).send({ data: { queued: true } });
  });
};
