import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@excess/db';
import { can } from '@excess/shared';
import { z } from 'zod';

const stepSchema = z.object({
  channel: z.enum(['WHATSAPP', 'EMAIL']),
  templateName: z.string().min(1).max(120),
  params: z.record(z.string()).default({}),
  delayHours: z.number().int().min(0).max(8760),
});

const createSequenceSchema = z.object({
  name: z.string().min(1).max(160),
  trigger: z.enum(['LEAD_STAGE', 'PROJECT_STAGE', 'MANUAL']),
  triggerValue: z.string().max(60).optional(),
  steps: z.array(stepSchema).min(1).max(20),
});

const patchSequenceSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  isActive: z.boolean().optional(),
});

export const sequencesRoutes: FastifyPluginAsync = async (app) => {
  // GET /sequences — list
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'sequences.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const sequences = await req.withTenant((tx) =>
      tx.sequence.findMany({
        where: { tenantId: req.auth.tenantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          trigger: true,
          triggerValue: true,
          isActive: true,
          createdAt: true,
          _count: { select: { steps: true, enrollments: true } },
        },
      }),
    );

    return reply.send({ data: sequences });
  });

  // GET /sequences/:id — detail with steps
  app.get('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'sequences.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const sequence = await req.withTenant((tx) =>
      tx.sequence.findUnique({
        where: { id },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      }),
    );
    if (!sequence) {
      return reply.code(404).send({ error: { code: 'sequence.not_found', message: 'Sequence not found' } });
    }
    return reply.send({ data: sequence });
  });

  // POST /sequences — create with steps
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'sequences.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createSequenceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { name, trigger, triggerValue, steps } = parsed.data;
    if (trigger !== 'MANUAL' && !triggerValue) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'A trigger stage is required for this trigger type' },
      });
    }

    const sequence = await req.withTenant(async (tx) => {
      const seq = await tx.sequence.create({
        data: {
          tenantId: req.auth.tenantId,
          name,
          trigger,
          ...(triggerValue && { triggerValue }),
        },
      });
      await tx.sequenceStep.createMany({
        data: steps.map((s, i) => ({
          sequenceId: seq.id,
          stepOrder: i,
          channel: s.channel,
          templateName: s.templateName,
          params: s.params as Prisma.InputJsonValue,
          delayHours: s.delayHours,
        })),
      });
      return seq;
    });

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, sequenceId: sequence.id }, 'sequence.created');
    return reply.code(201).send({ data: sequence });
  });

  // PATCH /sequences/:id — rename / toggle active
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'sequences.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = patchSequenceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data['name'] = parsed.data.name;
    if (parsed.data.isActive !== undefined) data['isActive'] = parsed.data.isActive;
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No fields to update' } });
    }

    const sequence = await req.withTenant((tx) =>
      tx.sequence.update({
        where: { id },
        data: data as Parameters<typeof tx.sequence.update>[0]['data'],
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, sequenceId: id }, 'sequence.updated');
    return reply.send({ data: sequence });
  });

  // DELETE /sequences/:id
  app.delete('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'sequences.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    await req.withTenant((tx) => tx.sequence.delete({ where: { id } }));
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, sequenceId: id }, 'sequence.deleted');
    return reply.code(204).send();
  });

  // GET /sequences/:id/analytics — enrollment funnel + stats
  app.get('/:id/analytics', async (req, reply) => {
    if (!can(req.auth.role, 'sequences.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const sequence = await req.withTenant((tx) =>
      tx.sequence.findUnique({
        where: { id },
        select: { id: true, name: true, steps: { orderBy: { stepOrder: 'asc' }, select: { stepOrder: true, templateName: true, delayHours: true } } },
      }),
    );
    if (!sequence) {
      return reply.code(404).send({ error: { code: 'sequence.not_found', message: 'Not found' } });
    }

    const [totalEnrolled, active, completed, optedOut, cancelled] = await req.withTenant((tx) =>
      Promise.all([
        tx.sequenceEnrollment.count({ where: { sequenceId: id } }),
        tx.sequenceEnrollment.count({ where: { sequenceId: id, status: 'ACTIVE' } }),
        tx.sequenceEnrollment.count({ where: { sequenceId: id, status: 'COMPLETED' } }),
        tx.sequenceEnrollment.count({ where: { sequenceId: id, status: 'OPTED_OUT' } }),
        tx.sequenceEnrollment.count({ where: { sequenceId: id, status: 'CANCELLED' } }),
      ]),
    );

    const completionRate = totalEnrolled > 0 ? Math.round((completed / totalEnrolled) * 100) : 0;
    const optOutRate     = totalEnrolled > 0 ? Math.round((optedOut  / totalEnrolled) * 100) : 0;

    const stepCount = sequence.steps.length;
    const stepFunnel: { step: number; count: number }[] = [];
    for (let step = 0; step <= stepCount; step++) {
      const count = await req.withTenant((tx) =>
        tx.sequenceEnrollment.count({
          where: { sequenceId: id, currentStep: { gte: step }, status: { not: 'CANCELLED' } },
        }),
      );
      stepFunnel.push({ step, count });
    }

    return reply.send({
      data: {
        sequenceId: id,
        name: sequence.name,
        totalEnrolled,
        active,
        completed,
        optedOut,
        cancelled,
        completionRate,
        optOutRate,
        stepFunnel,
      },
    });
  });

  // POST /sequences/:id/enroll — manually enrol a lead
  app.post('/:id/enroll', async (req, reply) => {
    if (!can(req.auth.role, 'sequences.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const body = z.object({ leadId: z.string().uuid() }).safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'leadId is required' } });
    }

    const sequence = await req.withTenant((tx) =>
      tx.sequence.findUnique({
        where: { id },
        select: { id: true, steps: { orderBy: { stepOrder: 'asc' }, take: 1, select: { delayHours: true } } },
      }),
    );
    if (!sequence) {
      return reply.code(404).send({ error: { code: 'sequence.not_found', message: 'Sequence not found' } });
    }
    const firstStep = sequence.steps[0];
    if (!firstStep) {
      return reply.code(422).send({ error: { code: 'sequence.no_steps', message: 'Sequence has no steps' } });
    }

    try {
      const enrollment = await req.withTenant((tx) =>
        tx.sequenceEnrollment.create({
          data: {
            tenantId: req.auth.tenantId,
            sequenceId: id,
            leadId: body.data.leadId,
            currentStep: 0,
            nextRunAt: new Date(Date.now() + firstStep.delayHours * 3600 * 1000),
          },
        }),
      );
      req.log.info({ tenantId: req.auth.tenantId, sequenceId: id, leadId: body.data.leadId }, 'sequence.enrolled');
      return reply.code(201).send({ data: enrollment });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        return reply.code(409).send({
          error: { code: 'sequence.already_enrolled', message: 'Lead is already enrolled in this sequence' },
        });
      }
      throw err;
    }
  });
};
