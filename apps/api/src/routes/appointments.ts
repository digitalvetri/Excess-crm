import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { z } from 'zod';

const createAppointmentSchema = z.object({
  leadId: z.string().uuid(),
  scheduledAt: z.string().datetime({ offset: true }),
  surveyType: z.enum(['ROOFTOP_RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'OFFGRID']),
  siteAddress: z.string().min(5),
  durationMin: z.number().int().min(15).max(480).optional(),
});

const patchAppointmentSchema = z.object({
  status: z.enum(['SCHEDULED', 'COMPLETED', 'RESCHEDULED', 'CANCELLED']).optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  siteAddress: z.string().min(5).optional(),
  postNotes: z.string().optional(),
  assignedEngineerId: z.string().uuid().optional(),
});

export const appointmentsRoutes: FastifyPluginAsync = async (app) => {
  // GET /appointments
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'appointments.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as {
      leadId?: string;
      status?: string;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: string;
    };

    const limit = Math.min(Number(query.limit ?? 20), 100);
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    const appointments = await req.withTenant(async (tx) =>
      tx.appointment.findMany({
        where: {
          ...(query.leadId && { leadId: query.leadId }),
          ...(query.status && { status: query.status as never }),
          ...((from ?? to)
            ? { scheduledAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }
            : {}),
          ...(query.cursor && { id: { lt: query.cursor } }),
        },
        orderBy: { scheduledAt: 'asc' },
        take: limit + 1,
        select: {
          id: true, leadId: true, scheduledAt: true, surveyType: true,
          siteAddress: true, status: true, durationMin: true, assignedEngineerId: true,
          lead: { select: { name: true, phone: true } },
        },
      }),
    );

    const hasMore = appointments.length > limit;
    const items = hasMore ? appointments.slice(0, limit) : appointments;
    const nextCursor = hasMore ? (items.at(-1)?.id ?? null) : null;

    return reply.send({ data: { appointments: items, nextCursor, hasMore } });
  });

  // GET /appointments/:id
  app.get('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'appointments.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const appointment = await req.withTenant(async (tx) =>
      tx.appointment.findUnique({
        where: { id },
        include: { lead: { select: { name: true, phone: true, city: true, stage: true } } },
      }),
    );

    if (!appointment) {
      return reply.code(404).send({ error: { code: 'appointment.not_found', message: 'Not found' } });
    }

    return reply.send({ data: appointment });
  });

  // POST /appointments
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'appointments.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { leadId, scheduledAt, surveyType, siteAddress, durationMin } = parsed.data;

    const appointment = await req.withTenant(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          tenantId: req.auth.tenantId,
          leadId,
          scheduledAt: new Date(scheduledAt),
          surveyType,
          siteAddress,
          ...(durationMin !== undefined && { durationMin }),
        },
      });

      await tx.leadActivity.create({
        data: {
          leadId,
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          actorIsAi: false,
          type: 'APPOINTMENT_BOOKED',
          payload: { appointmentId: created.id, scheduledAt, siteAddress } as object,
        },
      });

      return created;
    });

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, appointmentId: appointment.id }, 'appointment.created');
    return reply.code(201).send({ data: appointment });
  });

  // PATCH /appointments/:id
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'appointments.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = patchAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const rawData = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    ) as Record<string, unknown>;

    if (Object.keys(rawData).length === 0) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No fields to update' } });
    }

    if (typeof rawData['scheduledAt'] === 'string') {
      rawData['scheduledAt'] = new Date(rawData['scheduledAt']);
    }

    const appointment = await req.withTenant(async (tx) =>
      tx.appointment.update({ where: { id }, data: rawData as Parameters<typeof tx.appointment.update>[0]['data'] }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, appointmentId: id }, 'appointment.updated');
    return reply.send({ data: appointment });
  });
};
