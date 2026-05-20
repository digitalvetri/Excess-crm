import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { z } from 'zod';

const TICKET_TYPES = ['COMPLAINT', 'AMC_VISIT', 'WARRANTY', 'GENERAL'] as const;
const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;

type TicketType = (typeof TICKET_TYPES)[number];
type TicketStatus = (typeof TICKET_STATUSES)[number];

const createSchema = z.object({
  leadId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  type: z.enum(TICKET_TYPES),
  subject: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  priority: z.enum(PRIORITIES).optional(),
  scheduledVisitAt: z.string().datetime().optional(),
  assignedEngineerId: z.string().uuid().optional(),
});

const patchSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  scheduledVisitAt: z.string().datetime().nullable().optional(),
  assignedEngineerId: z.string().uuid().nullable().optional(),
});

export const serviceTicketsRoutes: FastifyPluginAsync = async (app) => {
  // GET /service-tickets — list with filters
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { status?: string; type?: string; projectId?: string; cursor?: string; limit?: string };
    const limit = Math.min(Number(query.limit ?? 25), 100);

    const tickets = await req.withTenant((tx) =>
      tx.serviceTicket.findMany({
        where: {
          tenantId: req.auth.tenantId,
          ...(query.status && { status: query.status as TicketStatus }),
          ...(query.type && { type: query.type as TicketType }),
          ...(query.projectId && { projectId: query.projectId }),
          ...(query.cursor && { id: { lt: query.cursor } }),
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        select: {
          id: true,
          type: true,
          subject: true,
          status: true,
          priority: true,
          scheduledVisitAt: true,
          assignedEngineerId: true,
          resolvedAt: true,
          createdAt: true,
          projectId: true,
          lead: { select: { id: true, name: true, phone: true } },
          project: { select: { id: true, number: true } },
        },
      }),
    );

    const hasMore = tickets.length > limit;
    const items = hasMore ? tickets.slice(0, limit) : tickets;

    return reply.send({
      data: { tickets: items, hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
    });
  });

  // GET /service-tickets/:id
  app.get('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const ticket = await req.withTenant((tx) =>
      tx.serviceTicket.findUnique({
        where: { id },
        include: {
          lead: { select: { id: true, name: true, phone: true, email: true, city: true } },
          project: { select: { id: true, number: true, stage: true } },
        },
      }),
    );

    if (!ticket) {
      return reply.code(404).send({ error: { code: 'service_ticket.not_found', message: 'Service ticket not found' } });
    }
    return reply.send({ data: ticket });
  });

  // POST /service-tickets
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const d = parsed.data;
    const ticket = await req.withTenant((tx) =>
      tx.serviceTicket.create({
        data: {
          tenantId: req.auth.tenantId,
          leadId: d.leadId,
          type: d.type,
          subject: d.subject,
          description: d.description,
          createdByUserId: req.auth.userId,
          ...(d.projectId && { projectId: d.projectId }),
          ...(d.priority && { priority: d.priority }),
          ...(d.scheduledVisitAt && { scheduledVisitAt: new Date(d.scheduledVisitAt) }),
          ...(d.assignedEngineerId && { assignedEngineerId: d.assignedEngineerId }),
        },
      }),
    );

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId, ticketId: ticket.id, type: d.type },
      'service_ticket.created',
    );
    return reply.code(201).send({ data: ticket });
  });

  // PATCH /service-tickets/:id
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { status, priority, scheduledVisitAt, assignedEngineerId } = parsed.data;
    const data: Record<string, unknown> = {};
    if (priority !== undefined) data['priority'] = priority;
    if (assignedEngineerId !== undefined) data['assignedEngineerId'] = assignedEngineerId;
    if (scheduledVisitAt !== undefined) {
      data['scheduledVisitAt'] = scheduledVisitAt ? new Date(scheduledVisitAt) : null;
    }
    if (status !== undefined) {
      data['status'] = status;
      data['resolvedAt'] = status === 'RESOLVED' || status === 'CLOSED' ? new Date() : null;
    }

    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No fields to update' } });
    }

    const existing = await req.withTenant((tx) =>
      tx.serviceTicket.findUnique({ where: { id }, select: { id: true } }),
    );
    if (!existing) {
      return reply.code(404).send({ error: { code: 'service_ticket.not_found', message: 'Service ticket not found' } });
    }

    const ticket = await req.withTenant((tx) =>
      tx.serviceTicket.update({
        where: { id },
        data: data as Parameters<typeof tx.serviceTicket.update>[0]['data'],
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, ticketId: id, status }, 'service_ticket.updated');
    return reply.send({ data: ticket });
  });
};
