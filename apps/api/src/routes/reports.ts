import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';

const AVG_DEAL_VALUE_INR = 300_000;

export const reportsRoutes: FastifyPluginAsync = async (app) => {
  // GET /reports/funnel — lead funnel stats for current month
  app.get('/funnel', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.team')) {
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

  // GET /reports/calls — call analytics (KPIs + daily trend + persona breakdown)
  app.get('/calls', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.team')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const where = { tenantId: req.auth.tenantId, initiatedAt: { gte: monthStart } };

    const [totalCalls, byStatusRows, aggResult, byPersonaRows, dailyRows, byHourRows] =
      await req.withTenant(async (tx) => {
        return Promise.all([
          tx.call.count({ where }),
          tx.call.groupBy({ by: ['status'], where, _count: { _all: true } }),
          tx.call.aggregate({ where, _avg: { durationSec: true } }),
          tx.call.groupBy({
            by: ['persona', 'status'],
            where,
            _count: { _all: true },
            _avg: { durationSec: true },
          }),
          tx.$queryRaw<{ day: Date; count: bigint }[]>`
            SELECT date_trunc('day', initiated_at AT TIME ZONE 'Asia/Kolkata') AS day,
                   COUNT(*)::bigint AS count
            FROM calls
            WHERE tenant_id = (SELECT current_setting('app.tenant_id', true))::uuid
              AND initiated_at >= NOW() - INTERVAL '14 days'
            GROUP BY 1 ORDER BY 1 ASC
          `,
          tx.$queryRaw<{ hour: number; count: bigint }[]>`
            SELECT EXTRACT(HOUR FROM initiated_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,
                   COUNT(*)::bigint AS count
            FROM calls
            WHERE tenant_id = (SELECT current_setting('app.tenant_id', true))::uuid
              AND initiated_at >= NOW() - INTERVAL '30 days'
            GROUP BY 1 ORDER BY 1 ASC
          `,
        ]);
      });

    const byStatus = byStatusRows.map((r) => ({ status: r.status, count: r._count._all }));
    const connectedCount = byStatus.find((s) => s.status === 'COMPLETED')?.count ?? 0;
    const connectRate = totalCalls > 0 ? Math.round((connectedCount / totalCalls) * 100) : 0;
    const avgDurationSec = Math.round(aggResult._avg.durationSec ?? 0);

    // Aggregate by persona
    const personaMap = new Map<string, { total: number; connected: number; totalDuration: number }>();
    for (const row of byPersonaRows) {
      const p = personaMap.get(row.persona) ?? { total: 0, connected: 0, totalDuration: 0 };
      p.total += row._count._all;
      if (row.status === 'COMPLETED') {
        p.connected += row._count._all;
        p.totalDuration += Math.round((row._avg.durationSec ?? 0) * row._count._all);
      }
      personaMap.set(row.persona, p);
    }
    const byPersona = Array.from(personaMap.entries()).map(([persona, stats]) => ({
      persona,
      total: stats.total,
      connected: stats.connected,
      connectRate: stats.total > 0 ? Math.round((stats.connected / stats.total) * 100) : 0,
      avgDurationSec: stats.connected > 0 ? Math.round(stats.totalDuration / stats.connected) : 0,
    }));

    const daily = dailyRows.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: Number(r.count) }));
    const byHour = byHourRows.map((r) => ({ hour: r.hour, count: Number(r.count) }));

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId }, 'reports.calls');
    return reply.send({
      data: {
        totalCalls,
        connectRate,
        avgDurationSec,
        byStatus,
        byPersona,
        daily,
        byHour,
      },
    });
  });

  // GET /reports/sources — lead source breakdown for current month
  app.get('/sources', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.team')) {
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
    if (!can(req.auth.role, 'leads.read.team')) {
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
    return reply.send({ data });
  });

  // GET /reports/agents — agent performance for current month
  app.get('/agents', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.team')) {
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
    if (!can(req.auth.role, 'leads.read.team')) {
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

  app.get('/nps', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.team')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { responses, requestedCount } = await req.withTenant(async (tx) => ({
      responses: await tx.review.findMany({
        where: { tenantId: req.auth.tenantId, npsScore: { not: null } },
        select: { npsScore: true, npsComment: true, npsRespondedAt: true, lead: { select: { name: true } } },
        orderBy: { npsRespondedAt: 'desc' },
      }),
      requestedCount: await tx.review.count({
        where: { tenantId: req.auth.tenantId, npsRequestedAt: { not: null } },
      }),
    }));

    let promoters = 0;
    let passives = 0;
    let detractors = 0;
    let sum = 0;
    for (const r of responses) {
      const s = r.npsScore ?? 0;
      sum += s;
      if (s >= 9) promoters++;
      else if (s >= 7) passives++;
      else detractors++;
    }
    const total = responses.length;
    const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;
    const avgScore = total > 0 ? Math.round((sum / total) * 10) / 10 : 0;
    const recentComments = responses
      .filter((r) => r.npsComment)
      .slice(0, 5)
      .map((r) => ({ name: r.lead.name, score: r.npsScore, comment: r.npsComment }));

    return reply.send({
      data: {
        nps,
        total,
        requestedCount,
        responseRate: requestedCount > 0 ? Math.round((total / requestedCount) * 100) : 0,
        avgScore,
        promoters,
        passives,
        detractors,
        recentComments,
      },
    });
  });

  // GET /reports/territory-revenue — revenue by pincode for installed projects
  app.get('/territory-revenue', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.team')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const cacheKey = `reports:territory-revenue:${req.auth.tenantId}`;
    const cached = await app.redis?.get(cacheKey);
    if (cached) return reply.send(JSON.parse(cached) as object);

    const projects = await req.withTenant((tx) =>
      tx.project.findMany({
        where: { stage: 'HANDED_OVER' },
        select: {
          totalValueInr: true,
          systemKw: true,
          lead: { select: { pincode: true, city: true } },
          payments: { select: { amountInr: true } },
        },
      }),
    );

    type TerritoryEntry = {
      pincode: string;
      city: string | null;
      projectCount: number;
      totalValueInr: number;
      totalSystemKw: number;
      totalReceivedInr: number;
    };
    const byPincode = new Map<string, TerritoryEntry>();

    for (const p of projects) {
      const pincode = p.lead.pincode ?? 'Unknown';
      const entry: TerritoryEntry = byPincode.get(pincode) ?? {
        pincode,
        city: p.lead.city,
        projectCount: 0,
        totalValueInr: 0,
        totalSystemKw: 0,
        totalReceivedInr: 0,
      };
      entry.projectCount++;
      entry.totalValueInr    += Number(p.totalValueInr);
      entry.totalSystemKw    += Number(p.systemKw);
      entry.totalReceivedInr += p.payments.reduce((s, pay) => s + Number(pay.amountInr), 0);
      byPincode.set(pincode, entry);
    }

    const territories = [...byPincode.values()]
      .filter((t) => t.pincode !== 'Unknown')
      .sort((a, b) => b.totalValueInr - a.totalValueInr)
      .slice(0, 30)
      .map((t) => ({
        ...t,
        collectionRate: t.totalValueInr > 0
          ? Math.min(100, Math.max(0, Math.round((t.totalReceivedInr / t.totalValueInr) * 100)))
          : 0,
      }));

    const totalInstalled  = projects.length;
    const totalValueInr   = projects.reduce((s, p) => s + Number(p.totalValueInr), 0);

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId }, 'reports.territory_revenue');
    const result = { data: { territories, totalInstalled, totalValueInr } };
    void app.redis?.setex(cacheKey, 300, JSON.stringify(result));
    return reply.send(result);
  });

  // GET /reports/profitability — per-project revenue collection for current year
  app.get('/profitability', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.team')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const profCacheKey = `reports:profitability:${req.auth.tenantId}`;
    const profCached = await app.redis?.get(profCacheKey);
    if (profCached) return reply.send(JSON.parse(profCached) as object);

    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const projects = await req.withTenant((tx) =>
      tx.project.findMany({
        where: { handedOverAt: { gte: yearStart } },
        select: {
          id: true,
          number: true,
          totalValueInr: true,
          systemKw: true,
          handedOverAt: true,
          lead: { select: { name: true, city: true } },
          payments: { select: { amountInr: true, type: true } },
        },
        orderBy: { handedOverAt: 'desc' },
        take: 50,
      }),
    );

    const enriched = projects.map((p) => {
      const totalReceived = p.payments.reduce((s, pay) => s + Number(pay.amountInr), 0);
      const totalValue    = Number(p.totalValueInr);
      const outstanding   = Math.max(0, totalValue - totalReceived);
      const collectionPct = totalValue > 0 ? Math.round((totalReceived / totalValue) * 100) : 0;
      return {
        id:               p.id,
        number:           p.number,
        customerName:     p.lead.name,
        city:             p.lead.city,
        systemKw:         Number(p.systemKw),
        totalValueInr:    totalValue,
        totalReceivedInr: totalReceived,
        outstandingInr:   outstanding,
        collectionPct,
        handedOverAt:     p.handedOverAt?.toISOString() ?? null,
        revenuePerKw:     Number(p.systemKw) > 0 ? Math.round(totalValue / Number(p.systemKw)) : 0,
      };
    });

    const summary = {
      totalProjects:       enriched.length,
      totalValueInr:       enriched.reduce((s, p) => s + p.totalValueInr, 0),
      totalReceivedInr:    enriched.reduce((s, p) => s + p.totalReceivedInr, 0),
      totalOutstandingInr: enriched.reduce((s, p) => s + p.outstandingInr, 0),
      avgCollectionPct:    enriched.length > 0
        ? Math.round(enriched.reduce((s, p) => s + p.collectionPct, 0) / enriched.length)
        : 0,
    };

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId }, 'reports.profitability');
    const profResult = { data: { projects: enriched, summary } };
    void app.redis?.setex(profCacheKey, 300, JSON.stringify(profResult));
    return reply.send(profResult);
  });

  // Acquisition cohorts — leads grouped by when they were created
  app.get('/cohorts', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.team')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const since = new Date();
    since.setMonth(since.getMonth() - 11);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const { leads, teams } = await req.withTenant(async (tx) => ({
      leads: await tx.lead.findMany({
        where: { tenantId: req.auth.tenantId, createdAt: { gte: since } },
        select: { createdAt: true, stage: true, sourceType: true, teamId: true },
      }),
      teams: await tx.team.findMany({
        where: { tenantId: req.auth.tenantId },
        select: { id: true, name: true },
      }),
    }));

    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const QUALIFIED_PLUS = new Set(['QUALIFIED', 'FOLLOW_UP', 'CONVERTED']);

    type Bucket = { totalLeads: number; qualified: number; converted: number };
    const newBucket = (): Bucket => ({ totalLeads: 0, qualified: 0, converted: 0 });
    const monthly = new Map<string, Bucket>();
    const bySource = new Map<string, Bucket>();
    const byTeam = new Map<string, Bucket>();

    for (const l of leads) {
      const period = l.createdAt.toISOString().slice(0, 7);
      const teamKey = l.teamId ? (teamName.get(l.teamId) ?? 'Unknown') : 'Unassigned';
      for (const [map, key] of [
        [monthly, period],
        [bySource, l.sourceType],
        [byTeam, teamKey],
      ] as const) {
        const b = map.get(key) ?? newBucket();
        b.totalLeads++;
        if (QUALIFIED_PLUS.has(l.stage)) b.qualified++;
        if (l.stage === 'CONVERTED') b.converted++;
        map.set(key, b);
      }
    }

    const toRows = (m: Map<string, Bucket>) =>
      [...m.entries()].map(([key, b]) => ({
        key,
        totalLeads: b.totalLeads,
        qualified: b.qualified,
        converted: b.converted,
        conversionRate: b.totalLeads > 0 ? Math.round((b.converted / b.totalLeads) * 100) : 0,
      }));

    return reply.send({
      data: {
        monthly: toRows(monthly).sort((a, b) => a.key.localeCompare(b.key)),
        bySource: toRows(bySource).sort((a, b) => b.totalLeads - a.totalLeads),
        byTeam: toRows(byTeam).sort((a, b) => b.totalLeads - a.totalLeads),
      },
    });
  });

  // Weighted pipeline forecast — open leads valued by stage win-probability
  app.get('/forecast', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.team')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const STAGE_PROB: Record<string, number> = {
      NEW: 0.1,
      QUALIFIED: 0.5,
      FOLLOW_UP: 0.3,
      NOT_ANSWERED: 0.05,
    };

    const { leads, quotations } = await req.withTenant(async (tx) => ({
      leads: await tx.lead.findMany({
        where: {
          tenantId: req.auth.tenantId,
          stage: { in: ['NEW', 'QUALIFIED', 'FOLLOW_UP', 'NOT_ANSWERED', 'CONVERTED'] },
        },
        select: { id: true, stage: true },
      }),
      quotations: await tx.quotation.findMany({
        where: { tenantId: req.auth.tenantId },
        select: { leadId: true, netPayable: true },
      }),
    }));

    // Highest quotation value seen per lead; fallback to the average deal size
    const valueByLead = new Map<string, number>();
    for (const q of quotations) {
      const v = Number(q.netPayable);
      valueByLead.set(q.leadId, Math.max(valueByLead.get(q.leadId) ?? 0, v));
    }

    type StageBucket = {
      stage: string;
      probability: number;
      leadCount: number;
      rawValue: number;
      weightedValue: number;
    };
    const stageMap = new Map<string, StageBucket>();
    let committedRevenue = 0;

    for (const l of leads) {
      const value = valueByLead.get(l.id) ?? AVG_DEAL_VALUE_INR;
      if (l.stage === 'CONVERTED') {
        committedRevenue += value;
        continue;
      }
      const probability = STAGE_PROB[l.stage];
      if (probability === undefined) continue;
      const sb = stageMap.get(l.stage) ?? {
        stage: l.stage,
        probability,
        leadCount: 0,
        rawValue: 0,
        weightedValue: 0,
      };
      sb.leadCount++;
      sb.rawValue += value;
      sb.weightedValue += value * probability;
      stageMap.set(l.stage, sb);
    }

    const order = ['QUALIFIED', 'FOLLOW_UP', 'NEW', 'NOT_ANSWERED'];
    const stages = [...stageMap.values()]
      .map((s) => ({ ...s, weightedValue: Math.round(s.weightedValue) }))
      .sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));

    return reply.send({
      data: {
        stages,
        totalWeighted: stages.reduce((s, x) => s + x.weightedValue, 0),
        totalRaw: stages.reduce((s, x) => s + x.rawValue, 0),
        committedRevenue: Math.round(committedRevenue),
      },
    });
  });

  // Conversation intelligence — aggregate sentiment + objections from analyzed calls
  app.get('/conversations', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.team')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    // Only calls that actually yielded a sentiment — calls with no extractable
    // transcript text are stamped analyzed but carry no signal, so excluding
    // them keeps analyzedCalls consistent with the sentiment + objection totals.
    const calls = await req.withTenant((tx) =>
      tx.call.findMany({
        where: { tenantId: req.auth.tenantId, sentiment: { not: null } },
        select: { sentiment: true, objectionTags: true },
      }),
    );

    const sentiment = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
    const objectionCounts = new Map<string, number>();
    for (const c of calls) {
      if (c.sentiment && c.sentiment in sentiment) {
        sentiment[c.sentiment as keyof typeof sentiment]++;
      }
      for (const tag of c.objectionTags) {
        objectionCounts.set(tag, (objectionCounts.get(tag) ?? 0) + 1);
      }
    }

    const topObjections = [...objectionCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    return reply.send({
      data: { analyzedCalls: calls.length, sentiment, topObjections },
    });
  });
};
