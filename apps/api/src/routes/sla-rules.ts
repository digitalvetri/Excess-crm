import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { z } from 'zod';
import type { LeadStage } from '@excess/db';

const createSlaRuleSchema = z.object({
  stage: z.enum(['NEW', 'QUALIFIED', 'FOLLOW_UP', 'CONVERTED', 'NOT_ANSWERED', 'INVALID', 'WRONG_ENQUIRY']),
  thresholdHours: z.number().int().min(1).max(720),
  action: z.enum(['NOTIFY', 'REASSIGN']),
  notifyUserId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

const patchSlaRuleSchema = createSlaRuleSchema.partial();

export const slaRulesRoutes: FastifyPluginAsync = async (app) => {
  // GET /sla-rules
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'routing_rules.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const rules = await req.withTenant((tx) =>
      tx.slaRule.findMany({
        where: { tenantId: req.auth.tenantId },
        orderBy: [{ stage: 'asc' }, { thresholdHours: 'asc' }],
      }),
    );

    return reply.send({ data: rules });
  });

  // POST /sla-rules
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'routing_rules.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createSlaRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { stage, thresholdHours, action, notifyUserId, isActive } = parsed.data;

    const rule = await req.withTenant((tx) =>
      tx.slaRule.create({
        data: {
          tenantId: req.auth.tenantId,
          stage: stage as LeadStage,
          thresholdHours,
          action: action as 'NOTIFY' | 'REASSIGN',
          notifyUserId: notifyUserId ?? null,
          ...(isActive !== undefined && { isActive }),
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, ruleId: rule.id }, 'sla_rule.created');
    return reply.code(201).send({ data: rule });
  });

  // PATCH /sla-rules/:id
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'routing_rules.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = patchSlaRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const cleanData = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    );

    if (Object.keys(cleanData).length === 0) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No fields to update' } });
    }

    const rule = await req.withTenant((tx) =>
      tx.slaRule.update({
        where: { id },
        data: cleanData as Parameters<typeof tx.slaRule.update>[0]['data'],
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, ruleId: id }, 'sla_rule.updated');
    return reply.send({ data: rule });
  });

  // DELETE /sla-rules/:id
  app.delete('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'routing_rules.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    await req.withTenant((tx) => tx.slaRule.delete({ where: { id } }));

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, ruleId: id }, 'sla_rule.deleted');
    return reply.code(204).send();
  });
};
