import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';

const AVG_DEAL_VALUE_INR = 300_000;

export const reportsRoutes: FastifyPluginAsync = async (app) => {
  // GET /reports/funnel — lead funnel stats for current month
  app.get('/funnel', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.all')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const rows = await req.withTenant((tx) =>
      tx.lead.groupBy({
        by: ['stage'],
        where: {
          tenantId: req.auth.tenantId,
          createdAt: { gte: monthStart },
        },
        _count: { _all: true },
      }),
    );

    const stages = rows.map((r) => ({ stage: r.stage, count: r._count._all }));

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId }, 'reports.funnel');
    return reply.send({ data: { monthStart: monthStart.toISOString(), stages } });
  });

  // GET /reports/calls — call analytics for current month
  app.get('/calls', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.all')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const where = { tenantId: req.auth.tenantId, initiatedAt: { gte: monthStart } };

    const [totalCalls, byStatusRows, aggResult] = await req.withTenant(async (tx) => {
      return Promise.all([
        tx.call.count({ where }),
        tx.call.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        }),
        tx.call.aggregate({
          where,
          _avg: { durationSec: true },
        }),
      ]);
    });

    const byStatus = byStatusRows.map((r) => ({ status: r.status, count: r._count._all }));
    const avgDurationSec = aggResult._avg.durationSec ?? 0;

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId }, 'reports.calls');
    return reply.send({ data: { totalCalls, byStatus, avgDurationSec } });
  });

  // GET /reports/sources — lead source breakdown for current month
  app.get('/sources', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.all')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const rows = await req.withTenant((tx) =>
      tx.lead.groupBy({
        by: ['sourceType'],
        where: {
          tenantId: req.auth.tenantId,
          createdAt: { gte: monthStart },
        },
        _count: { _all: true },
      }),
    );

    const sources = rows.map((r) => ({ sourceType: r.sourceType, count: r._count._all }));

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId }, 'reports.sources');
    return reply.send({ data: { sources } });
  });

  // GET /reports/daily — daily lead ingest trend for last 30 days
  app.get('/daily', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.all')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const data = await req.withTenant(async (tx) => {
      const rows = await tx.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata') AS day,
               COUNT(*)::bigint AS count
        FROM leads
        WHERE tenant_id = (SELECT current_setting('app.tenant_id', true))::uuid
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1
        ORDER BY 1 ASC
      `;
      return rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: Number(r.count) }));
    });

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId }, 'reports.daily');
    return reply.send({ data: { data } });
  });

  // GET /reports/agents — agent performance for current month
  app.get('/agents', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.all')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const baseWhere = {
      tenantId: req.auth.tenantId,
      ownerUserId: { not: null } as { not: null },
      createdAt: { gte: monthStart },
    };

    const [totalRows, convertedRows] = await req.withTenant(async (tx) => {
      return Promise.all([
        tx.lead.groupBy({
          by: ['ownerUserId'],
          where: baseWhere,
          _count: { _all: true },
        }),
        tx.lead.groupBy({
          by: ['ownerUserId'],
          where: { ...baseWhere, stage: 'CONVERTED' },
          _count: { _all: true },
        }),
      ]);
    });

    // Build a map of userId -> converted count
    const convertedMap = new Map<string, number>(
      convertedRows.map((r) => [r.ownerUserId as string, r._count._all]),
    );

    // Collect all unique owner user IDs
    const ownerIds = totalRows.map((r) => r.ownerUserId as string);

    // Fetch user names in one query (outside withTenant — user lookup is cross-tenant safe here)
    const users = await req.withTenant((tx) =>
      tx.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, name: true },
      }),
    );

    const nameMap = new Map<string, string>(users.map((u) => [u.id, u.name]));

    const agents = totalRows.map((r) => {
      const userId = r.ownerUserId as string;
      return {
        userId,
        name: nameMap.get(userId) ?? 'Unknown',
        total: r._count._all,
        converted: convertedMap.get(userId) ?? 0,
      };
    });

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId }, 'reports.agents');
    return reply.send({ data: { agents } });
  });

  // GET /reports/revenue-pipeline — revenue pipeline estimate
  app.get('/revenue-pipeline', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.all')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [qualifiedCount, quotationAggregate, quotationsThisMonth] = await req.withTenant(
      async (tx) => {
        return Promise.all([
          tx.lead.count({
            where: { tenantId: req.auth.tenantId, stage: 'QUALIFIED' },
          }),
          tx.quotation.aggregate({
            where: {
              tenantId: req.auth.tenantId,
              createdAt: { gte: monthStart },
            },
            _sum: { netPayable: true },
            _count: { _all: true },
          }),
          tx.quotation.count({
            where: {
              tenantId: req.auth.tenantId,
              createdAt: { gte: monthStart },
            },
          }),
        ]);
      },
    );

    const qualifiedPipeline = qualifiedCount * AVG_DEAL_VALUE_INR;
    const convertedRevenue = Number(quotationAggregate._sum.netPayable ?? 0);

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId },
      'reports.revenue_pipeline',
    );
    return reply.send({
      data: { qualifiedPipeline, convertedRevenue, quotationsThisMonth },
    });
  });
};
