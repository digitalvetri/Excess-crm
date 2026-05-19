import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { z } from 'zod';
import type { LeadStage } from '@excess/db';

const ACTIVITY_TYPES = ['NOTE', 'STAGE_CHANGE', 'ASSIGNMENT', 'CALL', 'WHATSAPP', 'QUOTATION_SENT', 'APPOINTMENT_BOOKED'];
const LEAD_FIELD_NAMES = ['email', 'city', 'pincode', 'factSheet'];

const createGateSchema = z.object({
  stage: z.enum(['NEW', 'QUALIFIED', 'FOLLOW_UP', 'CONVERTED', 'NOT_ANSWERED', 'INVALID', 'WRONG_ENQUIRY']),
  requiredFields: z.array(z.string().max(100)).default([]),
  requiredActivityTypes: z.array(z.string().max(100)).default([]),
  isActive: z.boolean().optional(),
});

const patchGateSchema = createGateSchema.partial();

export const stageGatesRoutes: FastifyPluginAsync = async (app) => {
  // GET /stage-gates/config — return available fields and activity types
  app.get('/config', async (_req, reply) => {
    return reply.send({
      data: {
        leadFields: LEAD_FIELD_NAMES,
        activityTypes: ACTIVITY_TYPES,
      },
    });
  });

  // GET /stage-gates
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'routing_rules.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const gates = await req.withTenant((tx) =>
      tx.stageGate.findMany({
        where: { tenantId: req.auth.tenantId },
        orderBy: { stage: 'asc' },
      }),
    );

    return reply.send({ data: gates });
  });

  // POST /stage-gates
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'routing_rules.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createGateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { stage, requiredFields, requiredActivityTypes, isActive } = parsed.data;

    const gate = await req.withTenant((tx) =>
      tx.stageGate.upsert({
        where: { tenantId_stage: { tenantId: req.auth.tenantId, stage: stage as LeadStage } },
        create: {
          tenantId: req.auth.tenantId,
          stage: stage as LeadStage,
          requiredFields: requiredFields as object,
          requiredActivityTypes,
          ...(isActive !== undefined && { isActive }),
        },
        update: {
          requiredFields: requiredFields as object,
          requiredActivityTypes,
          ...(isActive !== undefined && { isActive }),
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, gateId: gate.id, stage }, 'stage_gate.upserted');
    return reply.code(201).send({ data: gate });
  });

  // PATCH /stage-gates/:id
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'routing_rules.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = patchGateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { requiredFields, requiredActivityTypes, isActive } = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (requiredFields !== undefined) updateData['requiredFields'] = requiredFields;
    if (requiredActivityTypes !== undefined) updateData['requiredActivityTypes'] = requiredActivityTypes;
    if (isActive !== undefined) updateData['isActive'] = isActive;

    if (Object.keys(updateData).length === 0) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No fields to update' } });
    }

    const gate = await req.withTenant((tx) =>
      tx.stageGate.update({
        where: { id },
        data: updateData as Parameters<typeof tx.stageGate.update>[0]['data'],
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, gateId: id }, 'stage_gate.updated');
    return reply.send({ data: gate });
  });

  // DELETE /stage-gates/:id
  app.delete('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'routing_rules.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    await req.withTenant((tx) => tx.stageGate.delete({ where: { id } }));

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, gateId: id }, 'stage_gate.deleted');
    return reply.code(204).send();
  });
};
