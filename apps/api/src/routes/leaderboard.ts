import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';

export const leaderboardRoutes: FastifyPluginAsync = async (app) => {
  // GET /leaderboard — top agents and franchise tenants for the current month
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'leaderboard.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { agents, franchises } = await req.withTenant(async (tx) => {
      // Top agents by CONVERTED leads this month
      const agentStats = await tx.lead.groupBy({
        by: ['ownerUserId'],
        where: {
          stage: 'CONVERTED',
          stageChangedAt: { gte: monthStart },
          ownerUserId: { not: null },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      });

      const agentUserIds = agentStats.map((s) => s.ownerUserId!).filter(Boolean);

      const users = agentUserIds.length > 0
        ? await tx.user.findMany({
            where: { id: { in: agentUserIds } },
            select: { id: true, name: true },
          })
        : [];

      const userMap = new Map(users.map((u) => [u.id, u.name]));

      const agentsResult = agentStats.map((s) => ({
        userId: s.ownerUserId!,
        name: userMap.get(s.ownerUserId!) ?? 'Unknown',
        convertedLeads: s._count.id,
      }));

      // Top franchise tenants by commission this month
      const franchiseStats = await tx.commission.groupBy({
        by: ['tenantId'],
        where: {
          status: { in: ['APPROVED', 'PAID'] },
          createdAt: { gte: monthStart },
        },
        _sum: { commissionInr: true },
        orderBy: { _sum: { commissionInr: 'desc' } },
        take: 10,
      });

      const franchiseTenantIds = franchiseStats.map((s) => s.tenantId);

      const tenants = franchiseTenantIds.length > 0
        ? await tx.tenant.findMany({
            where: { id: { in: franchiseTenantIds } },
            select: { id: true, name: true },
          })
        : [];

      const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

      const franchisesResult = franchiseStats.map((s) => ({
        tenantId: s.tenantId,
        name: tenantMap.get(s.tenantId) ?? 'Unknown',
        commissionInr: s._sum.commissionInr?.toNumber() ?? 0,
      }));

      return { agents: agentsResult, franchises: franchisesResult };
    });

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId },
      'leaderboard.read',
    );
    return reply.send({ data: { monthStart, agents, franchises } });
  });
};
