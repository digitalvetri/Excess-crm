import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@excess/db';
import { can } from '@excess/shared';
import { z } from 'zod';

const sendMessageSchema = z.object({
  leadId: z.string().uuid(),
  message: z.string().min(1).max(4096),
});

export const whatsappMessagingRoutes: FastifyPluginAsync = async (app) => {
  // GET /whatsapp/conversations — list active WaSessions for tenant
  app.get('/conversations', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.own')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { cursor?: string; limit?: string };
    const limit = Math.min(Number(query.limit ?? 20), 100);

    const sessions = await req.withTenant(async (tx) =>
      tx.waSession.findMany({
        where: {
          ...(query.cursor && { id: { lt: query.cursor } }),
        },
        orderBy: { lastMessageAt: 'desc' },
        take: limit + 1,
        select: {
          id: true,
          leadId: true,
          phone: true,
          sessionExpiresAt: true,
          lastMessageAt: true,
          createdAt: true,
        },
      }),
    );

    // Enrich with lead data — fetch leads for returned sessions
    const leadIds = sessions.map((s) => s.leadId).filter(Boolean) as string[];
    const leads = leadIds.length > 0
      ? await req.withTenant(async (tx) =>
          tx.lead.findMany({
            where: { id: { in: leadIds } },
            select: { id: true, name: true, phone: true, stage: true },
          }),
        )
      : [];

    const leadMap = new Map(leads.map((l) => [l.id, l]));

    const hasMore = sessions.length > limit;
    const items = hasMore ? sessions.slice(0, limit) : sessions;

    const result = items.map((s) => ({
      ...s,
      lead: leadMap.get(s.leadId) ?? null,
    }));

    return reply.send({
      data: { conversations: result, hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
    });
  });

  // GET /whatsapp/conversations/:leadId — WhatsApp message history for a lead
  app.get('/conversations/:leadId', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.own')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { leadId } = req.params as { leadId: string };

    const lead = await req.withTenant(async (tx) =>
      tx.lead.findUnique({ where: { id: leadId }, select: { id: true } }),
    );

    if (!lead) {
      return reply.code(404).send({ error: { code: 'lead.not_found', message: 'Lead not found' } });
    }

    const activities = await req.withTenant(async (tx) =>
      tx.leadActivity.findMany({
        where: { leadId, type: 'WHATSAPP' },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          actorUserId: true,
          actorIsAi: true,
          payload: true,
          createdAt: true,
        },
      }),
    );

    return reply.send({ data: { leadId, messages: activities } });
  });

  // POST /whatsapp/send — send a direct WhatsApp message to a lead
  app.post('/send', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.own')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { leadId, message } = parsed.data;

    const lead = await req.withTenant(async (tx) =>
      tx.lead.findUnique({ where: { id: leadId }, select: { id: true, phone: true, name: true } }),
    );

    if (!lead) {
      return reply.code(404).send({ error: { code: 'lead.not_found', message: 'Lead not found' } });
    }

    await app.queues.whatsappSend.add('whatsapp-send', {
      tenantId: req.auth.tenantId,
      leadId,
      phone: lead.phone,
      template: 'DIRECT_MESSAGE',
      vars: { message },
    });

    await req.withTenant((tx) =>
      tx.leadActivity.create({
        data: {
          leadId,
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          actorIsAi: false,
          type: 'WHATSAPP',
          payload: { message, direction: 'outbound' } as object,
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId }, 'whatsapp.message_queued');
    return reply.code(202).send({ data: { queued: true } });
  });
};
