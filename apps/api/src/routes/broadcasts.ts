import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@excess/db';
import type { LeadSourceType, LeadStage } from '@excess/db';
import { can } from '@excess/shared';
import { z } from 'zod';

const MAX_RECIPIENTS = 5000;
const PER_SECOND = Math.max(1, Number(process.env['BROADCAST_PER_SECOND'] ?? 10));

const audienceFilterSchema = z.object({
  stage: z.enum(['NEW', 'QUALIFIED', 'FOLLOW_UP', 'CONVERTED', 'NOT_ANSWERED', 'INVALID', 'WRONG_ENQUIRY']).optional(),
  sourceType: z.enum(['META', 'INDIAMART', 'JUSTDIAL', 'WEBSITE', 'WHATSAPP', 'MANUAL', 'PHONE_INBOUND']).optional(),
  city: z.string().max(100).optional(),
  tag: z.string().max(60).optional(),
});

const createBroadcastSchema = z.object({
  name: z.string().min(1).max(160),
  templateName: z.string().max(120).optional(),
  templateParams: z.record(z.string()).optional(),
  bodyText: z.string().max(2000).optional(),
  audienceFilter: audienceFilterSchema.default({}),
});

type AudienceFilter = z.infer<typeof audienceFilterSchema>;

function buildLeadWhere(tenantId: string, filter: AudienceFilter) {
  return {
    tenantId,
    isDuplicate: false,
    commsOptedOutAt: null,
    ...(filter.stage && { stage: filter.stage as LeadStage }),
    ...(filter.sourceType && { sourceType: filter.sourceType as LeadSourceType }),
    ...(filter.city && { city: { contains: filter.city, mode: 'insensitive' as const } }),
    ...(filter.tag && { tags: { has: filter.tag } }),
  };
}

export const broadcastsRoutes: FastifyPluginAsync = async (app) => {
  // GET /broadcasts — list
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const broadcasts = await req.withTenant((tx) =>
      tx.broadcast.findMany({
        where: { tenantId: req.auth.tenantId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          name: true,
          channel: true,
          templateName: true,
          status: true,
          recipientCount: true,
          sentCount: true,
          failedCount: true,
          scheduledAt: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
        },
      }),
    );

    return reply.send({ data: broadcasts });
  });

  // GET /broadcasts/:id — detail
  app.get('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const broadcast = await req.withTenant((tx) =>
      tx.broadcast.findUnique({ where: { id } }),
    );
    if (!broadcast) {
      return reply.code(404).send({ error: { code: 'broadcast.not_found', message: 'Broadcast not found' } });
    }
    return reply.send({ data: broadcast });
  });

  // POST /broadcasts/preview — audience size for a filter
  app.post('/preview', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = audienceFilterSchema.safeParse((req.body as { audienceFilter?: unknown })?.audienceFilter ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid filter' } });
    }

    const where = buildLeadWhere(req.auth.tenantId, parsed.data);
    const { count, sample } = await req.withTenant(async (tx) => ({
      count: await tx.lead.count({ where }),
      sample: await tx.lead.findMany({ where, take: 5, select: { name: true, city: true }, orderBy: { createdAt: 'desc' } }),
    }));

    return reply.send({ data: { count: Math.min(count, MAX_RECIPIENTS), totalMatched: count, sample } });
  });

  // POST /broadcasts — create draft
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createBroadcastSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { name, templateName, templateParams, bodyText, audienceFilter } = parsed.data;
    if (!templateName && !bodyText) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Provide a template name or message text' },
      });
    }

    const broadcast = await req.withTenant((tx) =>
      tx.broadcast.create({
        data: {
          tenantId: req.auth.tenantId,
          name,
          channel: 'WHATSAPP',
          createdByUserId: req.auth.userId,
          audienceFilter: audienceFilter as Prisma.InputJsonValue,
          ...(templateName && { templateName }),
          ...(templateParams && { templateParams: templateParams as Prisma.InputJsonValue }),
          ...(bodyText && { bodyText }),
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, broadcastId: broadcast.id }, 'broadcast.created');
    return reply.code(201).send({ data: broadcast });
  });

  // POST /broadcasts/:id/start — materialise recipients and enqueue sends
  app.post('/:id/start', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const broadcast = await req.withTenant((tx) => tx.broadcast.findUnique({ where: { id } }));
    if (!broadcast) {
      return reply.code(404).send({ error: { code: 'broadcast.not_found', message: 'Broadcast not found' } });
    }
    if (broadcast.status !== 'DRAFT' && broadcast.status !== 'SCHEDULED') {
      return reply.code(409).send({
        error: { code: 'broadcast.not_startable', message: 'Broadcast has already been started' },
      });
    }

    const filterParsed = audienceFilterSchema.safeParse(broadcast.audienceFilter ?? {});
    const where = buildLeadWhere(req.auth.tenantId, filterParsed.success ? filterParsed.data : {});

    const leads = await req.withTenant((tx) =>
      tx.lead.findMany({ where, take: MAX_RECIPIENTS, select: { id: true, phone: true } }),
    );

    if (leads.length === 0) {
      return reply.code(422).send({
        error: { code: 'broadcast.empty_audience', message: 'No leads match this audience' },
      });
    }

    const recipients = await req.withTenant(async (tx) => {
      await tx.broadcastRecipient.createMany({
        data: leads.map((l) => ({
          broadcastId: id,
          tenantId: req.auth.tenantId,
          leadId: l.id,
          phone: l.phone,
        })),
      });
      await tx.broadcast.update({
        where: { id },
        data: { status: 'SENDING', startedAt: new Date(), recipientCount: leads.length },
      });
      return tx.broadcastRecipient.findMany({
        where: { broadcastId: id },
        select: { id: true, leadId: true, phone: true },
      });
    });

    const templateParams = (broadcast.templateParams ?? {}) as Record<string, string>;
    await app.queues.broadcastSend.addBulk(
      recipients.map((r, idx) => ({
        name: 'broadcast-send',
        data: {
          broadcastId: id,
          recipientId: r.id,
          tenantId: req.auth.tenantId,
          leadId: r.leadId,
          phone: r.phone,
          channel: broadcast.channel,
          templateName: broadcast.templateName,
          templateParams,
          bodyText: broadcast.bodyText,
        },
        opts: { attempts: 1, delay: Math.floor(idx / PER_SECOND) * 1000 },
      })),
    );

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId, broadcastId: id, recipients: recipients.length },
      'broadcast.started',
    );
    return reply.send({ data: { id, status: 'SENDING', recipientCount: recipients.length } });
  });

  // DELETE /broadcasts/:id — delete a draft
  app.delete('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const broadcast = await req.withTenant((tx) =>
      tx.broadcast.findUnique({ where: { id }, select: { status: true } }),
    );
    if (!broadcast) {
      return reply.code(404).send({ error: { code: 'broadcast.not_found', message: 'Broadcast not found' } });
    }
    if (broadcast.status !== 'DRAFT') {
      return reply.code(409).send({
        error: { code: 'broadcast.not_deletable', message: 'Only draft broadcasts can be deleted' },
      });
    }

    await req.withTenant((tx) => tx.broadcast.delete({ where: { id } }));
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, broadcastId: id }, 'broadcast.deleted');
    return reply.code(204).send();
  });
};
