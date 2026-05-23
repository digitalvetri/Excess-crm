import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { can } from '@excess/shared';
import { z } from 'zod';

const createAppointmentSchema = z.object({
  leadId: z.string().uuid(),
  scheduledAt: z.string().datetime({ offset: true }),
  surveyType: z.enum(['ROOFTOP_RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'OFFGRID']),
  siteAddress: z.string().min(5),
  siteLat: z.number().optional(),
  siteLng: z.number().optional(),
  durationMin: z.number().int().min(15).max(480).optional(),
  assignedEngineerId: z.string().uuid().optional(),
});

const patchAppointmentSchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  siteAddress: z.string().min(5).optional(),
  postNotes: z.string().optional(),
  assignedEngineerId: z.string().uuid().optional(),
  durationMin: z.number().int().min(15).max(480).optional(),
});

const completeSurveySchema = z.object({
  estimatedKw: z.number().positive().optional(),
  roofCondition: z.string().max(200).optional(),
  postNotes: z.string().max(2000).optional(),
  surveyPhotoKeys: z.array(z.string()).max(8).optional(),
  readyToQuote: z.boolean().optional(),
});

// ─── Slot helpers ─────────────────────────────────────────────────────────────

const BUSINESS_START_H = 9;
const BUSINESS_END_H = 18;
const TRAVEL_BUFFER_MIN = 30;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function generateDaySlots(date: Date, durationMin: number): Date[] {
  const slots: Date[] = [];
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  for (let h = BUSINESS_START_H; h + durationMin / 60 <= BUSINESS_END_H; h++) {
    const slotUtc = new Date(Date.UTC(y, m, d, h - 5, 60 - 30, 0, 0));
    slots.push(slotUtc);
    // 30-min sub-slots
    const halfUtc = new Date(slotUtc.getTime() + 30 * 60 * 1000);
    if (halfUtc.getTime() + durationMin * 60000 <= new Date(Date.UTC(y, m, d, BUSINESS_END_H - 5, 60 - 30)).getTime()) {
      slots.push(halfUtc);
    }
  }
  return slots;
}

function overlaps(slotStart: Date, durationMin: number, apptStart: Date, apptDuration: number, bufferMin: number): boolean {
  const slotEnd = slotStart.getTime() + (durationMin + bufferMin) * 60000;
  const apptEnd = apptStart.getTime() + (apptDuration + bufferMin) * 60000;
  return slotStart.getTime() < apptEnd && slotEnd > apptStart.getTime();
}

export const appointmentsRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /appointments ────────────────────────────────────────────────────────
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'appointments.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as {
      leadId?: string;
      status?: string;
      engineerId?: string;
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
          ...(query.engineerId && { assignedEngineerId: query.engineerId }),
          ...((from ?? to) ? { scheduledAt: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {}),
          ...(query.cursor && { id: { lt: query.cursor } }),
        },
        orderBy: { scheduledAt: 'asc' },
        take: limit + 1,
        select: {
          id: true, leadId: true, scheduledAt: true, surveyType: true,
          siteAddress: true, siteLat: true, siteLng: true, status: true,
          durationMin: true, assignedEngineerId: true, confirmedAt: true,
          completedAt: true, noShowAt: true, estimatedKw: true,
          lead: { select: { name: true, phone: true } },
        },
      }),
    );

    const hasMore = appointments.length > limit;
    const items = hasMore ? appointments.slice(0, limit) : appointments;
    const nextCursor = hasMore ? (items.at(-1)?.id ?? null) : null;

    return reply.send({ data: { appointments: items, nextCursor, hasMore } });
  });

  // ── GET /appointments/slots ──────────────────────────────────────────────────
  app.get('/slots', async (req, reply) => {
    if (!can(req.auth.role, 'appointments.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { date?: string; durationMin?: string };
    if (!query.date) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'date query param required (YYYY-MM-DD)' } });
    }

    const dateUtc = new Date(query.date + 'T00:00:00+05:30');
    if (isNaN(dateUtc.getTime())) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid date format' } });
    }

    const durationMin = Math.min(Math.max(Number(query.durationMin ?? 60), 15), 480);
    const dayStart = new Date(dateUtc);
    const dayEnd = new Date(dateUtc.getTime() + 24 * 60 * 60 * 1000);

    const [engineers, dayAppointments] = await req.withTenant(async (tx) =>
      Promise.all([
        tx.user.findMany({
          where: { role: 'ENGINEER', isActive: true },
          select: { id: true, name: true },
        }),
        tx.appointment.findMany({
          where: {
            scheduledAt: { gte: dayStart, lt: dayEnd },
            status: { notIn: ['CANCELLED'] },
          },
          select: { assignedEngineerId: true, scheduledAt: true, durationMin: true },
        }),
      ]),
    );

    const slots = generateDaySlots(dateUtc, durationMin);

    const result = engineers.map((eng) => {
      const engAppts = dayAppointments.filter((a) => a.assignedEngineerId === eng.id);
      const available = slots.filter((slot) =>
        !engAppts.some((a) =>
          overlaps(slot, durationMin, a.scheduledAt, a.durationMin, TRAVEL_BUFFER_MIN),
        ),
      );
      return {
        engineerId: eng.id,
        engineerName: eng.name,
        availableSlots: available.map((s) => s.toISOString()),
        bookedCount: engAppts.length,
      };
    });

    return reply.send({ data: { date: query.date, durationMin, engineers: result } });
  });

  // ── GET /appointments/map ────────────────────────────────────────────────────
  app.get('/map', async (req, reply) => {
    if (!can(req.auth.role, 'appointments.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { from?: string; to?: string };
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 7 * 86400000);
    const to = query.to ? new Date(query.to) : new Date(Date.now() + 30 * 86400000);

    const appointments = await req.withTenant(async (tx) =>
      tx.appointment.findMany({
        where: {
          scheduledAt: { gte: from, lte: to },
          status: { notIn: ['CANCELLED'] },
        },
        select: {
          id: true, scheduledAt: true, surveyType: true, siteAddress: true,
          siteLat: true, siteLng: true, status: true, assignedEngineerId: true,
          durationMin: true, confirmedAt: true,
          lead: { select: { name: true, phone: true } },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 200,
      }),
    );

    return reply.send({ data: { appointments } });
  });

  // ── GET /appointments/:id ────────────────────────────────────────────────────
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

  // ── POST /appointments ───────────────────────────────────────────────────────
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'appointments.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { leadId, scheduledAt, surveyType, siteAddress, durationMin, siteLat, siteLng, assignedEngineerId } = parsed.data;

    const appointment = await req.withTenant(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          tenantId: req.auth.tenantId,
          leadId,
          scheduledAt: new Date(scheduledAt),
          surveyType,
          siteAddress,
          completionToken: randomUUID(),
          ...(durationMin !== undefined && { durationMin }),
          ...(siteLat !== undefined && { siteLat: siteLat.toString() }),
          ...(siteLng !== undefined && { siteLng: siteLng.toString() }),
          ...(assignedEngineerId !== undefined && { assignedEngineerId }),
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

  // ── PATCH /appointments/:id ──────────────────────────────────────────────────
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
      rawData['scheduledAt'] = new Date(rawData['scheduledAt'] as string);
    }

    const appointment = await req.withTenant(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: rawData as Parameters<typeof tx.appointment.update>[0]['data'],
      });

      if (rawData['scheduledAt']) {
        await tx.leadActivity.create({
          data: {
            leadId: updated.leadId,
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            actorIsAi: false,
            type: 'APPOINTMENT_RESCHEDULED',
            payload: { appointmentId: id, scheduledAt: rawData['scheduledAt'] } as object,
          },
        });
      }

      return updated;
    });

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, appointmentId: id }, 'appointment.updated');
    return reply.send({ data: appointment });
  });

  // ── POST /appointments/:id/confirm ───────────────────────────────────────────
  app.post('/:id/confirm', async (req, reply) => {
    if (!can(req.auth.role, 'appointments.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };

    const appointment = await req.withTenant(async (tx) => {
      const existing = await tx.appointment.findUnique({ where: { id }, select: { id: true, leadId: true, status: true, scheduledAt: true } });
      if (!existing) return null;
      if (existing.status !== 'SCHEDULED') {
        throw Object.assign(new Error('Appointment is not in SCHEDULED state'), { statusCode: 409 });
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });

      await tx.leadActivity.create({
        data: {
          leadId: existing.leadId,
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          actorIsAi: false,
          type: 'APPOINTMENT_CONFIRMED',
          payload: { appointmentId: id, confirmedAt: new Date().toISOString() } as object,
        },
      });

      return updated;
    });

    if (!appointment) {
      return reply.code(404).send({ error: { code: 'appointment.not_found', message: 'Not found' } });
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, appointmentId: id }, 'appointment.confirmed');
    return reply.send({ data: appointment });
  });

  // ── POST /appointments/:id/no-show ───────────────────────────────────────────
  app.post('/:id/no-show', async (req, reply) => {
    if (!can(req.auth.role, 'appointments.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };

    const appointment = await req.withTenant(async (tx) => {
      const existing = await tx.appointment.findUnique({
        where: { id },
        select: { id: true, leadId: true, status: true },
      });
      if (!existing) return null;
      if (!['SCHEDULED', 'CONFIRMED'].includes(existing.status)) {
        throw Object.assign(new Error('Appointment cannot be marked no-show from current status'), { statusCode: 409 });
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: { status: 'NO_SHOW', noShowAt: new Date() },
      });

      await tx.leadActivity.create({
        data: {
          leadId: existing.leadId,
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          actorIsAi: false,
          type: 'APPOINTMENT_NO_SHOW',
          payload: { appointmentId: id } as object,
        },
      });

      return { updated, leadId: existing.leadId };
    });

    if (!appointment) {
      return reply.code(404).send({ error: { code: 'appointment.not_found', message: 'Not found' } });
    }

    // Enqueue Reshma re-engagement call for no-show
    await app.queues.voiceDial.add(
      'voice-dial',
      { leadId: appointment.leadId, tenantId: req.auth.tenantId, personaId: 'RESHMA_FOLLOWUP' },
      { delay: 2 * 60 * 60 * 1000, priority: 2 },
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, appointmentId: id, leadId: appointment.leadId }, 'appointment.no_show');
    return reply.send({ data: appointment.updated });
  });

  // ── POST /appointments/:id/complete ──────────────────────────────────────────
  app.post('/:id/complete', async (req, reply) => {
    if (!can(req.auth.role, 'appointments.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = completeSurveySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { estimatedKw, roofCondition, postNotes, surveyPhotoKeys, readyToQuote } = parsed.data;

    const appointment = await req.withTenant(async (tx) => {
      const existing = await tx.appointment.findUnique({
        where: { id },
        select: { id: true, leadId: true, status: true, surveyType: true },
      });
      if (!existing) return null;
      if (['COMPLETED', 'CANCELLED'].includes(existing.status)) {
        throw Object.assign(new Error('Appointment is already completed or cancelled'), { statusCode: 409 });
      }

      const updateData: Record<string, unknown> = {
        status: 'COMPLETED',
        completedAt: new Date(),
      };
      if (estimatedKw !== undefined) updateData['estimatedKw'] = estimatedKw.toString();
      if (roofCondition !== undefined) updateData['roofCondition'] = roofCondition;
      if (postNotes !== undefined) updateData['postNotes'] = postNotes;
      if (surveyPhotoKeys !== undefined) updateData['surveyPhotoKeys'] = surveyPhotoKeys;

      const updated = await tx.appointment.update({
        where: { id },
        data: updateData as Parameters<typeof tx.appointment.update>[0]['data'],
      });

      await tx.leadActivity.create({
        data: {
          leadId: existing.leadId,
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          actorIsAi: false,
          type: 'APPOINTMENT_COMPLETED',
          payload: {
            appointmentId: id,
            estimatedKw: estimatedKw ?? null,
            readyToQuote: readyToQuote ?? false,
          } as object,
        },
      });

      // Auto-create quotation draft if engineer marked ready
      if (readyToQuote) {
        const count = await tx.quotation.count({ where: { tenantId: req.auth.tenantId } });
        await tx.quotation.create({
          data: {
            tenantId: req.auth.tenantId,
            leadId: existing.leadId,
            number: `QT-${String(count + 1).padStart(5, '0')}`,
            systemKw: estimatedKw?.toString() ?? '5',
            brandTier: 'MID',
            totalInr: '0',
            subsidyInr: '0',
            netPayable: '0',
            status: 'DRAFT',
            createdByUserId: req.auth.userId,
          },
        });
      }

      return updated;
    });

    if (!appointment) {
      return reply.code(404).send({ error: { code: 'appointment.not_found', message: 'Not found' } });
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, appointmentId: id }, 'appointment.completed');
    return reply.send({ data: appointment });
  });

  // ── POST /appointments/:id/cancel ────────────────────────────────────────────
  app.post('/:id/cancel', async (req, reply) => {
    if (!can(req.auth.role, 'appointments.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const body = req.body as { reason?: string };
    const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : 'Cancelled by admin';

    const appointment = await req.withTenant(async (tx) => {
      const existing = await tx.appointment.findUnique({
        where: { id },
        select: { id: true, leadId: true, status: true },
      });
      if (!existing) return null;
      if (existing.status === 'CANCELLED') {
        throw Object.assign(new Error('Appointment is already cancelled'), { statusCode: 409 });
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: { status: 'CANCELLED', cancelReason: reason },
      });

      await tx.leadActivity.create({
        data: {
          leadId: existing.leadId,
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          actorIsAi: false,
          type: 'APPOINTMENT_CANCELLED',
          payload: { appointmentId: id, reason } as object,
        },
      });

      return updated;
    });

    if (!appointment) {
      return reply.code(404).send({ error: { code: 'appointment.not_found', message: 'Not found' } });
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, appointmentId: id }, 'appointment.cancelled');
    return reply.send({ data: appointment });
  });

  // ── POST /appointments/:id/reassign ──────────────────────────────────────────
  app.post('/:id/reassign', async (req, reply) => {
    if (!can(req.auth.role, 'appointments.assign')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const body = req.body as { engineerId?: string };

    if (!body?.engineerId || typeof body.engineerId !== 'string') {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'engineerId is required' } });
    }

    const appointment = await req.withTenant(async (tx) => {
      const existing = await tx.appointment.findUnique({
        where: { id },
        select: { id: true, leadId: true, status: true, assignedEngineerId: true },
      });
      if (!existing) return null;
      if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
        throw Object.assign(new Error('Cannot reassign a completed or cancelled appointment'), { statusCode: 409 });
      }

      const engineerId = body.engineerId as string;
      const engineer = await tx.user.findFirst({
        where: { id: engineerId, role: 'ENGINEER', isActive: true },
        select: { id: true, name: true },
      });
      if (!engineer) {
        throw Object.assign(new Error('Engineer not found or inactive'), { statusCode: 404 });
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: { assignedEngineerId: engineerId },
      });

      await tx.leadActivity.create({
        data: {
          leadId: existing.leadId,
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          actorIsAi: false,
          type: 'ASSIGNMENT',
          payload: {
            appointmentId: id,
            previousEngineerId: existing.assignedEngineerId,
            newEngineerId: body.engineerId,
            engineerName: engineer.name,
          } as object,
        },
      });

      return updated;
    });

    if (!appointment) {
      return reply.code(404).send({ error: { code: 'appointment.not_found', message: 'Not found' } });
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, appointmentId: id, engineerId: body.engineerId }, 'appointment.reassigned');
    return reply.send({ data: appointment });
  });
};

// ─── Public survey completion route (no auth) ─────────────────────────────────

const publicSurveySchema = z.object({
  estimatedKw: z.number().positive().optional(),
  roofCondition: z.string().max(200).optional(),
  postNotes: z.string().max(2000).optional(),
  surveyPhotoKeys: z.array(z.string()).max(8).optional(),
  readyToQuote: z.boolean().optional(),
});

export const surveyCompletionRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { token: string } }>(
    '/:token',
    { config: { public: true } },
    async (req, reply) => {
      const { token } = req.params;
      const parsed = publicSurveySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
      }

      const { estimatedKw, roofCondition, postNotes, surveyPhotoKeys, readyToQuote } = parsed.data;

      const { prisma, withSystemContext, SYSTEM_USER_ID } = await import('@excess/db');

      const existing = await prisma.appointment.findUnique({
        where: { completionToken: token },
        select: { id: true, leadId: true, tenantId: true, status: true },
      });

      if (!existing) {
        return reply.code(404).send({ error: { code: 'survey.invalid_token', message: 'Invalid or expired survey link' } });
      }
      if (['COMPLETED', 'CANCELLED'].includes(existing.status)) {
        return reply.code(409).send({ error: { code: 'survey.already_submitted', message: 'Survey already submitted' } });
      }

      await withSystemContext(prisma, existing.tenantId, async (tx) => {
        const updateData: Record<string, unknown> = {
          status: 'COMPLETED',
          completedAt: new Date(),
          completionToken: null,
        };
        if (estimatedKw !== undefined) updateData['estimatedKw'] = estimatedKw.toString();
        if (roofCondition !== undefined) updateData['roofCondition'] = roofCondition;
        if (postNotes !== undefined) updateData['postNotes'] = postNotes;
        if (surveyPhotoKeys !== undefined) updateData['surveyPhotoKeys'] = surveyPhotoKeys;

        await tx.appointment.update({
          where: { id: existing.id },
          data: updateData as Parameters<typeof tx.appointment.update>[0]['data'],
        });

        await tx.leadActivity.create({
          data: {
            leadId: existing.leadId,
            tenantId: existing.tenantId,
            actorUserId: SYSTEM_USER_ID,
            actorIsAi: false,
            type: 'APPOINTMENT_COMPLETED',
            payload: {
              appointmentId: existing.id,
              estimatedKw: estimatedKw ?? null,
              readyToQuote: readyToQuote ?? false,
              source: 'engineer_form',
            } as object,
          },
        });

        if (readyToQuote) {
          const count = await tx.quotation.count({ where: { tenantId: existing.tenantId } });
          await tx.quotation.create({
            data: {
              tenantId: existing.tenantId,
              leadId: existing.leadId,
              number: `QT-${String(count + 1).padStart(5, '0')}`,
              systemKw: estimatedKw?.toString() ?? '5',
              brandTier: 'MID',
              totalInr: '0',
              subsidyInr: '0',
              netPayable: '0',
              status: 'DRAFT',
              createdByUserId: SYSTEM_USER_ID,
            },
          });
        }
      });

      req.log.info({ appointmentId: existing.id, tenantId: existing.tenantId }, 'survey.completed_via_public_form');
      return reply.send({ data: { message: 'Survey submitted successfully. Thank you!' } });
    },
  );
};
