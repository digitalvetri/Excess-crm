import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@excess/db';
import { can } from '@excess/shared';
import { z } from 'zod';

const createRuleSchema = z.object({
  priority: z.number().int().min(1).max(999),
  condition: z.record(z.unknown()),
  targetTeamId: z.string().uuid(),
  isActive: z.boolean().optional(),
});

const patchRuleSchema = z.object({
  priority: z.number().int().min(1).max(999).optional(),
  condition: z.record(z.unknown()).optional(),
  targetTeamId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

export const routingRulesRoutes: FastifyPluginAsync = async (app) => {
  // GET /routing-rules
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'routing_rules.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const rules = await req.withTenant(async (tx) =>
      tx.routingRule.findMany({
        orderBy: { priority: 'asc' },
        include: { targetTeam: { select: { id: true, name: true } } },
      }),
    );

    return reply.send({ data: rules });
  });

  // POST /routing-rules
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'routing_rules.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { priority, condition, targetTeamId, isActive } = parsed.data;

    const rule = await req.withTenant(async (tx) =>
      tx.routingRule.create({
        data: {
          tenantId: req.auth.tenantId,
          priority,
          condition: condition as Prisma.InputJsonValue,
          targetTeamId,
          ...(isActive !== undefined && { isActive }),
        },
        include: { targetTeam: { select: { id: true, name: true } } },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, ruleId: rule.id }, 'routing_rule.created');
    return reply.code(201).send({ data: rule });
  });

  // PATCH /routing-rules/:id
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'routing_rules.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = patchRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const cleanData = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    ) as Record<string, unknown>;

    if (Object.keys(cleanData).length === 0) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No fields to update' } });
    }

    const rule = await req.withTenant(async (tx) =>
      tx.routingRule.update({ where: { id }, data: cleanData as Parameters<typeof tx.routingRule.update>[0]['data'] }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, ruleId: id }, 'routing_rule.updated');
    return reply.send({ data: rule });
  });

  // DELETE /routing-rules/:id
  app.delete('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'routing_rules.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    await req.withTenant(async (tx) => tx.routingRule.delete({ where: { id } }));

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, ruleId: id }, 'routing_rule.deleted');
    return reply.code(204).send();
  });
};
