import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@excess/db';
import { can, DEFAULT_COMMISSION_PER_KW_INR } from '@excess/shared';
import { z } from 'zod';
import { encodeCursor, decodeCursor, keysetOrderBy, keysetCondition } from '../lib/keyset.js';

const createCommissionSchema = z.object({
  leadId: z.string().uuid(),
  dealValueInr: z.number().positive(),
  ratePercent: z.number().positive().max(100),
  gstInr: z.number().min(0).optional(),
  deductionsInr: z.number().min(0).optional(),
});

async function enrichCommissions(
  commissions: { leadId: string; tenantId: string; [k: string]: unknown }[],
  tx: Prisma.TransactionClient,
) {
  if (commissions.length === 0) return commissions;

  const leadIds   = [...new Set(commissions.map((c) => c.leadId))];
  const tenantIds = [...new Set(commissions.map((c) => c.tenantId))];

  const [leads, tenants] = await Promise.all([
    tx.lead.findMany({
      where: { id: { in: leadIds } },
      select: { id: true, name: true, phone: true },
    }),
    tx.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true },
    }),
  ]);

  const leadMap   = new Map(leads.map((l) => [l.id, l]));
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  return commissions.map((c) => ({
    ...c,
    leadName:      leadMap.get(c.leadId)?.name    ?? null,
    leadPhone:     leadMap.get(c.leadId)?.phone   ?? null,
    franchiseName: tenantMap.get(c.tenantId)?.name ?? null,
  }));
}

export const commissionsRoutes: FastifyPluginAsync = async (app) => {
  // GET /commissions/summary — aggregate totals for HQ dashboard
  app.get('/summary', async (req, reply) => {
    if (!can(req.auth.role, 'commissions.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const [pending, approved, paid] = await req.withTenant(async (tx) =>
      Promise.all([
        tx.commission.aggregate({ where: { status: 'PENDING_APPROVAL' }, _sum: { netPayableInr: true }, _count: true }),
        tx.commission.aggregate({ where: { status: 'APPROVED' },         _sum: { netPayableInr: true }, _count: true }),
        tx.commission.aggregate({ where: { status: 'PAID' },             _sum: { netPayableInr: true }, _count: true }),
      ]),
    );

    return reply.send({
      data: {
        pendingCount:  pending._count,
        pendingInr:    pending._sum.netPayableInr?.toString()  ?? '0',
        approvedCount: approved._count,
        approvedInr:   approved._sum.netPayableInr?.toString() ?? '0',
        paidCount:     paid._count,
        paidInr:       paid._sum.netPayableInr?.toString()     ?? '0',
      },
    });
  });

  // GET /commissions — list enriched with lead + franchise name
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'commissions.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { status?: string; franchiseId?: string; cursor?: string; limit?: string };
    const limit = Math.min(Number(query.limit ?? 50), 100);
    const keyset = keysetCondition('createdAt', 'desc', decodeCursor(query.cursor));

    const { items, hasMore, nextCursor } = await req.withTenant(async (tx) => {
      const commissions = await tx.commission.findMany({
        where: {
          ...(query.status      && { status: query.status as never }),
          ...(query.franchiseId && { tenantId: query.franchiseId }),
          ...(keyset            && { AND: [keyset] }),
        },
        orderBy: keysetOrderBy('createdAt', 'desc'),
        take: limit + 1,
        select: {
          id: true, leadId: true, tenantId: true, dealValueInr: true,
          ratePercent: true, commissionInr: true, netPayableInr: true,
          gstInr: true, deductionsInr: true, status: true,
          approvedByUserId: true, paidAt: true, payoutId: true, createdAt: true,
        },
      });

      const hm  = commissions.length > limit;
      const raw = hm ? commissions.slice(0, limit) : commissions;
      const enriched = await enrichCommissions(raw, tx);
      const last = raw.at(-1);
      return { items: enriched, hasMore: hm, nextCursor: hm && last ? encodeCursor(last.createdAt, last.id) : null };
    });

    return reply.send({ data: { commissions: items, hasMore, nextCursor } });
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
    const gst           = gstInr        ?? 0;
    const deductions    = deductionsInr ?? 0;
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
          ...(gstInr        !== undefined && { gstInr }),
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

    const commission = await req.withTenant(async (tx) => {
      const updated = await tx.commission.update({
        where: { id },
        data: { status: 'APPROVED', approvedByUserId: req.auth.userId },
      });

      // Auto-calculate per-agent splits from franchise's agentSplitConfig
      const franchise = await tx.tenant.findUnique({
        where: { id: updated.tenantId },
        select: { agentSplitConfig: true },
      });

      const splitConfig = franchise?.agentSplitConfig as Record<string, number> | null;

      if (splitConfig && Object.keys(splitConfig).length > 0) {
        const agents = await tx.user.findMany({
          where: { tenantId: updated.tenantId, isActive: true, agentRole: { not: null } },
          select: { id: true, agentRole: true },
        });

        const splitData = agents
          .filter((a) => a.agentRole && splitConfig[a.agentRole] !== undefined)
          .map((a) => ({
            commissionId: updated.id,
            userId:       a.id,
            tenantId:     updated.tenantId,
            agentRole:    a.agentRole!,
            splitPercent: splitConfig[a.agentRole!]!,
            amountInr:    (Number(updated.netPayableInr) * splitConfig[a.agentRole!]!) / 100,
          }));

        if (splitData.length > 0) {
          await tx.commissionSplit.createMany({ data: splitData, skipDuplicates: true });
        }
      }

      return updated;
    });

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

  // GET /commissions/projections — pipeline-based commission forecast
  app.get('/projections', async (req, reply) => {
    if (!can(req.auth.role, 'commissions.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const cutoff90d = new Date(Date.now() - 90 * 86400000);

    const [pipelineLeads, last90dCommissions] = await req.withTenant((tx) =>
      Promise.all([
        tx.lead.findMany({
          where: { stage: { in: ['QUALIFIED', 'FOLLOW_UP', 'NEW'] } },
          select: { stage: true },
        }),
        tx.commission.findMany({
          where: { createdAt: { gte: cutoff90d } },
          select: { dealValueInr: true, netPayableInr: true, status: true },
        }),
      ]),
    );

    const paidCommissions = last90dCommissions.filter((c) => c.status !== 'DISPUTED');

    // Franchise rule is flat ₹1,500/kW, so deal value is usually 0 — project on the
    // historical commission amount directly, not a % of deal value (which divided by 0).
    const avgCommissionInr =
      paidCommissions.length > 0
        ? paidCommissions.reduce((s, c) => s + Number(c.netPayableInr), 0) / paidCommissions.length
        : DEFAULT_COMMISSION_PER_KW_INR * 5; // assume a typical ~5 kW install

    // Rate / deal-value averages only make sense for rows that actually carry a deal value.
    const withDealValue = paidCommissions.filter((c) => Number(c.dealValueInr) > 0);
    const avgRatePercent =
      withDealValue.length > 0
        ? withDealValue.reduce(
            (s, c) => s + (Number(c.netPayableInr) / Number(c.dealValueInr)) * 100,
            0,
          ) / withDealValue.length
        : 0;
    const avgDealValueInr =
      withDealValue.length > 0
        ? withDealValue.reduce((s, c) => s + Number(c.dealValueInr), 0) / withDealValue.length
        : 0;

    const qualified = pipelineLeads.filter((l) => l.stage === 'QUALIFIED').length;
    const followUp  = pipelineLeads.filter((l) => l.stage === 'FOLLOW_UP').length;
    const newLeads  = pipelineLeads.filter((l) => l.stage === 'NEW').length;

    const expectedConversions =
      qualified * 0.45 + followUp * 0.2 + newLeads * 0.05;
    const projectedRevenueInr    = expectedConversions * avgDealValueInr;
    const projectedCommissionInr = expectedConversions * avgCommissionInr;

    const confidence =
      paidCommissions.length >= 20 ? 'high' : paidCommissions.length >= 5 ? 'medium' : 'low';

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId }, 'commissions.projections');
    return reply.send({
      data: {
        pipeline: { qualified, followUp, new: newLeads },
        expectedConversions: Math.round(expectedConversions * 10) / 10,
        projectedRevenueInr:    Math.round(projectedRevenueInr),
        projectedCommissionInr: Math.round(projectedCommissionInr),
        avgCommissionInr: Math.round(avgCommissionInr),
        avgRatePercent: Math.round(avgRatePercent * 10) / 10,
        avgDealValueInr: Math.round(avgDealValueInr),
        confidence,
      },
    });
  });
};
