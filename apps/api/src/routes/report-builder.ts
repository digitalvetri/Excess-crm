import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@excess/db';
import { can } from '@excess/shared';
import { z } from 'zod';

// Whitelisted dimensions & metrics — never accept arbitrary fields
const definitionSchema = z.object({
  dimension: z.enum(['stage', 'source', 'team', 'owner', 'city', 'month']),
  metric: z.enum(['count', 'conversionRate', 'avgAiScore']),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

type Definition = z.infer<typeof definitionSchema>;

interface LeadRow {
  stage: string;
  sourceType: string;
  teamId: string | null;
  ownerUserId: string | null;
  city: string | null;
  createdAt: Date;
  aiScore: number | null;
}

async function runDefinition(
  withTenant: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>,
  tenantId: string,
  def: Definition,
): Promise<{ dimension: string; metric: string; rows: { label: string; value: number }[] }> {
  const createdAt: Prisma.DateTimeFilter = {};
  if (def.dateFrom) createdAt.gte = new Date(def.dateFrom);
  if (def.dateTo) createdAt.lte = new Date(def.dateTo);

  const { leads, teams, users } = await withTenant(async (tx) => ({
    leads: (await tx.lead.findMany({
      where: { tenantId, ...(def.dateFrom || def.dateTo ? { createdAt } : {}) },
      select: {
        stage: true, sourceType: true, teamId: true, ownerUserId: true,
        city: true, createdAt: true, aiScore: true,
      },
    })) as LeadRow[],
    teams: def.dimension === 'team'
      ? await tx.team.findMany({ where: { tenantId }, select: { id: true, name: true } })
      : [],
    users: def.dimension === 'owner'
      ? await tx.user.findMany({ where: { tenantId }, select: { id: true, name: true } })
      : [],
  }));

  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const userName = new Map(users.map((u) => [u.id, u.name]));

  function keyOf(l: LeadRow): string {
    switch (def.dimension) {
      case 'stage': return l.stage;
      case 'source': return l.sourceType;
      case 'team': return l.teamId ? (teamName.get(l.teamId) ?? 'Unknown') : 'Unassigned';
      case 'owner': return l.ownerUserId ? (userName.get(l.ownerUserId) ?? 'Unknown') : 'Unassigned';
      case 'city': return l.city ?? 'Unknown';
      case 'month': return l.createdAt.toISOString().slice(0, 7);
    }
  }

  const groups = new Map<string, LeadRow[]>();
  for (const l of leads) {
    const k = keyOf(l);
    const arr = groups.get(k) ?? [];
    arr.push(l);
    groups.set(k, arr);
  }

  const rows = [...groups.entries()].map(([label, items]) => {
    let value: number;
    if (def.metric === 'count') {
      value = items.length;
    } else if (def.metric === 'conversionRate') {
      const converted = items.filter((i) => i.stage === 'CONVERTED').length;
      value = items.length > 0 ? Math.round((converted / items.length) * 100) : 0;
    } else {
      const scored = items.filter((i) => i.aiScore != null);
      value = scored.length > 0
        ? Math.round(scored.reduce((s, i) => s + (i.aiScore ?? 0), 0) / scored.length)
        : 0;
    }
    return { label, value };
  });

  rows.sort((a, b) => (def.dimension === 'month' ? a.label.localeCompare(b.label) : b.value - a.value));
  return { dimension: def.dimension, metric: def.metric, rows };
}

export const reportBuilderRoutes: FastifyPluginAsync = async (app) => {
  // POST /report-builder/run — execute an ad-hoc definition
  app.post('/run', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.all')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const parsed = definitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid report definition', details: parsed.error.flatten() },
      });
    }
    const result = await runDefinition(req.withTenant, req.auth.tenantId, parsed.data);
    return reply.send({ data: result });
  });

  // GET /report-builder/saved — list saved reports
  app.get('/saved', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.all')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const reports = await req.withTenant((tx) =>
      tx.savedReport.findMany({
        where: { tenantId: req.auth.tenantId },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return reply.send({ data: reports });
  });

  // POST /report-builder/saved — save a report definition
  app.post('/saved', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.all')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const parsed = z
      .object({ name: z.string().min(1).max(160), definition: definitionSchema })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }
    const report = await req.withTenant((tx) =>
      tx.savedReport.create({
        data: {
          tenantId: req.auth.tenantId,
          name: parsed.data.name,
          definition: parsed.data.definition as Prisma.InputJsonValue,
          createdByUserId: req.auth.userId,
        },
      }),
    );
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, reportId: report.id }, 'saved_report.created');
    return reply.code(201).send({ data: report });
  });

  // DELETE /report-builder/saved/:id
  app.delete('/saved/:id', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.all')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { id } = req.params as { id: string };
    await req.withTenant((tx) => tx.savedReport.delete({ where: { id } }));
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, reportId: id }, 'saved_report.deleted');
    return reply.code(204).send();
  });
};
