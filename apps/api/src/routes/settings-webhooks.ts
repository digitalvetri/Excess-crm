import { randomBytes } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { can } from '@excess/shared';
import { prisma } from '@excess/db';

const SUPPORTED_EVENTS = [
  'lead.created',
  'lead.stage_changed',
  'lead.assigned',
  'appointment.created',
  'ticket.created',
  'commission.approved',
] as const;

const createSchema = z.object({
  url: z.string().url(),
  description: z.string().max(200).optional(),
  events: z.array(z.enum(SUPPORTED_EVENTS)).min(1),
});

const updateSchema = z.object({
  url: z.string().url().optional(),
  description: z.string().max(200).optional(),
  events: z.array(z.enum(SUPPORTED_EVENTS)).optional(),
  isActive: z.boolean().optional(),
});

export const settingsWebhooksRoutes: FastifyPluginAsync = async (app) => {
  // GET /settings/webhooks
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'settings.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { tenantId: req.auth.tenantId },
      select: {
        id: true, url: true, description: true, events: true, isActive: true, createdAt: true,
        deliveries: {
          orderBy: { attemptedAt: 'desc' },
          take: 5,
          select: { id: true, event: true, success: true, statusCode: true, responseMs: true, attemptedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: { endpoints, supportedEvents: SUPPORTED_EVENTS } });
  });

  // POST /settings/webhooks
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'settings.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }
    const secret = randomBytes(32).toString('hex');
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        tenantId: req.auth.tenantId,
        url: parsed.data.url,
        description: parsed.data.description ?? null,
        events: parsed.data.events as string[],
        secret,
      },
      select: { id: true, url: true, description: true, events: true, isActive: true, secret: true, createdAt: true },
    });
    req.log.info({ tenantId: req.auth.tenantId, endpointId: endpoint.id }, 'webhook_endpoint.created');
    return reply.code(201).send({ data: endpoint });
  });

  // PATCH /settings/webhooks/:id
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'settings.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { id } = req.params as { id: string };
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }
    const endpoint = await prisma.webhookEndpoint.updateMany({
      where: { id, tenantId: req.auth.tenantId },
      data: {
        ...(parsed.data.url && { url: parsed.data.url }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.events && { events: parsed.data.events as string[] }),
        ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
      },
    });
    if (endpoint.count === 0) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Endpoint not found' } });
    }
    return reply.send({ data: { updated: true } });
  });

  // DELETE /settings/webhooks/:id
  app.delete('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'settings.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { id } = req.params as { id: string };
    await prisma.webhookEndpoint.deleteMany({ where: { id, tenantId: req.auth.tenantId } });
    return reply.send({ data: { deleted: true } });
  });

  // POST /settings/webhooks/:id/rotate-secret
  app.post('/:id/rotate-secret', async (req, reply) => {
    if (!can(req.auth.role, 'settings.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { id } = req.params as { id: string };
    const secret = randomBytes(32).toString('hex');
    await prisma.webhookEndpoint.updateMany({ where: { id, tenantId: req.auth.tenantId }, data: { secret } });
    return reply.send({ data: { secret } });
  });
};
