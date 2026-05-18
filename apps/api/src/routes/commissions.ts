import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@excess/db';
import { can } from '@excess/shared';
import { z } from 'zod';

const createCommissionSchema = z.object({
  leadId: z.string().uuid(),
  dealValueInr: z.number().positive(),
  ratePercent: z.number().positive().max(100),
  gstInr: z.number().min(0).optional(),
  deductionsInr: z.number().min(0).optional(),
});

export const commissionsRoutes: FastifyPluginAsync = async (app) => {
  // GET /commissions — list (tenant-scoped or all for HQ admin)
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'commissions.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { status?: string; cursor?: string; limit?: string };
    const limit = Math.min(Number(query.limit ?? 20), 100);

    const commissions = await req.withTenant(async (tx) =>
      tx.commission.findMany({
        where: {
          ...(query.status && { status: query.status as never }),
          ...(query.cursor && { id: { lt: query.cursor } }),
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        select: {
          id: true, leadId: true, tenantId: true, dealValueInr: true,
          ratePercent: true, commissionInr: true, netPayableInr: true,
          gstInr: true, deductionsInr: true, status: true,
          approvedByUserId: true, paidAt: true, createdAt: true,
        },
      }),
    );

    const hasMore = commissions.length > limit;
    const items = hasMore ? commissions.slice(0, limit) : commissions;

    return reply.send({ data: { commissions: items, hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null } });
  });

  // GET /commissions/:id
  app.get('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'commissions.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const commission = await req.withTenant(async (tx) => tx.commission.findUnique({ where: { id } }));

    if (!commission) {
      return reply.code(404).send({ error: { code: 'commission.not_found', message: 'Not found' } });
    }

    return reply.send({ data: commission });
  });

  // POST /commissions — manually create commission entry
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'commissions.approve')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createCommissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { leadId, dealValueInr, ratePercent, gstInr, deductionsInr } = parsed.data;

    const commissionInr = (dealValueInr * ratePercent) / 100;
    const gst = gstInr ?? 0;
    const deductions = deductionsInr ?? 0;
    const netPayableInr = commissionInr + gst - deductions;

    const commission = await req.withTenant(async (tx) =>
      tx.commission.create({
        data: {
          tenantId: req.auth.tenantId,
          leadId,
          dealValueInr,
          ratePercent,
          commissionInr,
          netPayableInr,
          ...(gstInr !== undefined && { gstInr }),
          ...(deductionsInr !== undefined && { deductionsInr }),
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, commissionId: commission.id }, 'commission.created');
    return reply.code(201).send({ data: commission });
  });

  // POST /commissions/:id/approve
  app.post('/:id/approve', async (req, reply) => {
    if (!can(req.auth.role, 'commissions.approve')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const commission = await req.withTenant(async (tx) =>
      tx.commission.update({
        where: { id },
        data: { status: 'APPROVED', approvedByUserId: req.auth.userId },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, commissionId: id }, 'commission.approved');
    return reply.send({ data: commission });
  });

  // POST /commissions/:id/dispute
  app.post('/:id/dispute', async (req, reply) => {
    if (!can(req.auth.role, 'commissions.approve')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const commission = await req.withTenant(async (tx) =>
      tx.commission.update({ where: { id }, data: { status: 'DISPUTED' } }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, commissionId: id }, 'commission.disputed');
    return reply.send({ data: commission });
  });
};
