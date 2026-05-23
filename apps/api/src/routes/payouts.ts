import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { z } from 'zod';

const createPayoutSchema = z.object({
  commissionIds: z.array(z.string().uuid()).min(1),
  bankUtr:       z.string().optional(),
  paidAt:        z.string().datetime({ offset: true }).optional(),
});

export const payoutsRoutes: FastifyPluginAsync = async (app) => {
  // GET /payouts
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'payouts.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { cursor?: string; limit?: string; franchiseId?: string };
    const limit = Math.min(Number(query.limit ?? 20), 100);

    const payouts = await req.withTenant(async (tx) =>
      tx.payout.findMany({
        where: {
          ...(query.franchiseId && { tenantId: query.franchiseId }),
          ...(query.cursor      && { id: { lt: query.cursor } }),
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        select: {
          id: true, tenantId: true, amountInr: true, bankUtr: true,
          paidAt: true, commissionIds: true, createdAt: true,
          tenant: { select: { name: true } },
        },
      }),
    );

    const hasMore = payouts.length > limit;
    const items   = hasMore ? payouts.slice(0, limit) : payouts;

    const enriched = items.map(({ tenant, ...p }) => ({
      ...p,
      franchiseName: tenant.name,
    }));

    return reply.send({ data: { payouts: enriched, hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null } });
  });

  // POST /payouts — create payout (batch approved commissions → marks them PAID)
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'payouts.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createPayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { commissionIds, bankUtr, paidAt } = parsed.data;

    const commissions = await req.withTenant(async (tx) =>
      tx.commission.findMany({
        where:  { id: { in: commissionIds }, status: 'APPROVED' },
        select: { id: true, netPayableInr: true, tenantId: true },
      }),
    );

    if (commissions.length === 0) {
      return reply.code(400).send({ error: { code: 'payout.no_approved_commissions', message: 'No approved commissions found' } });
    }

    const tenantIds = [...new Set(commissions.map((c) => c.tenantId))];
    if (tenantIds.length > 1) {
      return reply.code(400).send({ error: { code: 'payout.mixed_tenants', message: 'All commissions must belong to the same franchise' } });
    }

    const totalAmount = commissions.reduce((sum, c) => sum + Number(c.netPayableInr), 0);
    const payoutDate  = paidAt ? new Date(paidAt) : new Date();
    const tenantId    = tenantIds[0]!;

    const payout = await req.withTenant(async (tx) => {
      const p = await tx.payout.create({
        data: {
          tenantId,
          amountInr:    totalAmount,
          commissionIds,
          paidAt:       payoutDate,
          ...(bankUtr !== undefined && { bankUtr }),
        },
      });

      await tx.commission.updateMany({
        where: { id: { in: commissions.map((c) => c.id) } },
        data:  { status: 'PAID', paidAt: payoutDate, payoutId: p.id },
      });

      return p;
    });

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId, payoutId: payout.id, amount: totalAmount },
      'payout.created',
    );
    return reply.code(201).send({ data: payout });
  });
};
