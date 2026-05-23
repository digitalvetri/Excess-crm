import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@excess/db';
import { can } from '@excess/shared';

export const engagementRoutes: FastifyPluginAsync = async (app) => {
  // GET /engagement/summary — single call for the hub KPI strip
  app.get('/summary', async (req, reply) => {
    if (!can(req.auth.role, 'leaderboard.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [reviewAgg, referralCount, walletData, topAgentData] = await req.withTenant(async (tx) =>
      Promise.all([
        tx.review.aggregate({
          _avg: { rating: true },
          _count: { id: true },
        }),
        tx.referral.count({ where: { createdAt: { gte: monthStart } } }),
        tx.wallet.findFirst({
          where: { tenantId: req.auth.tenantId },
          select: { balanceInr: true },
        }),
        tx.lead.groupBy({
          by: ['ownerUserId'],
          where: { stage: 'CONVERTED', stageChangedAt: { gte: monthStart }, ownerUserId: { not: null } },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 1,
        }),
      ]),
    );

    let topAgentName: string | null = null;
    let topAgentCount = 0;
    if (topAgentData.length > 0 && topAgentData[0]!.ownerUserId) {
      topAgentCount = topAgentData[0]!._count.id;
      const user = await prisma.user.findUnique({
        where: { id: topAgentData[0]!.ownerUserId },
        select: { name: true },
      });
      topAgentName = user?.name ?? null;
    }

    return reply.send({
      data: {
        avgRating:      Number(reviewAgg._avg.rating ?? 0).toFixed(1),
        totalReviews:   reviewAgg._count.id,
        referralsThisMonth: referralCount,
        walletBalance:  walletData?.balanceInr?.toString() ?? '0',
        topAgent:       topAgentName,
        topAgentDeals:  topAgentCount,
      },
    });
  });
};
