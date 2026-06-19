import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { z } from 'zod';

type AmcStatusFilter = 'all' | 'active' | 'expiring30' | 'expiring60' | 'expired' | 'renewed' | 'cancelled';

const createSchema = z.object({
  projectId:  z.string().uuid(),
  planYears:  z.number().int().min(1).max(5).default(1),
  startDate:  z.string().date(),
  valueInr:   z.number().positive().optional(),
  notes:      z.string().max(2000).optional(),
});

const patchSchema = z.object({
  status: z.enum(['CANCELLED']).optional(),
  notes:  z.string().max(2000).optional(),
});

const renewSchema = z.object({
  planYears: z.number().int().min(1).max(5).default(1),
  valueInr:  z.number().positive().optional(),
  notes:     z.string().max(2000).optional(),
});

const bulkRenewSchema = z.object({
  ids:       z.array(z.string().uuid()).min(1).max(50),
  planYears: z.number().int().min(1).max(5),
});

export const amcContractsRoutes: FastifyPluginAsync = async (app) => {

  // ── POST /amc-contracts/bulk-renew ───────────────────────────────────────────
  app.post('/bulk-renew', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = bulkRenewSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }

    const { ids, planYears } = parsed.data;

    const olds = await req.withTenant((tx) =>
      tx.amcContract.findMany({
        where:  { id: { in: ids }, status: { not: 'RENEWED' } },
        select: { id: true, projectId: true, leadId: true, endDate: true },
      })
    );

    if (olds.length === 0) {
      return reply.code(400).send({ error: { code: 'no_eligible', message: 'No eligible contracts to renew' } });
    }

    await req.withTenant((tx) =>
      Promise.all(
        olds.flatMap((old) => {
          const start = new Date(old.endDate.getTime() + 86400000);
          const end   = new Date(start);
          end.setFullYear(end.getFullYear() + planYears);
          return [
            tx.amcContract.create({
              data: {
                tenantId:        req.auth.tenantId,
                projectId:       old.projectId,
                leadId:          old.leadId,
                planYears,
                startDate:       start,
                endDate:         end,
                createdByUserId: req.auth.userId,
              },
            }),
            tx.amcContract.update({ where: { id: old.id }, data: { status: 'RENEWED' } }),
            tx.project.update({ where: { id: old.projectId }, data: { amcExpiresAt: end } }),
          ];
        })
      )
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, count: olds.length }, 'amc_contract.bulk_renewed');
    return reply.send({ data: { renewed: olds.length } });
  });

  // ── GET /amc-contracts ───────────────────────────────────────────────────────
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const q      = req.query as { window?: AmcStatusFilter; projectId?: string; cursor?: string; limit?: string };
    const limit  = Math.min(Number(q.limit ?? 50), 200);
    const now    = new Date();
    const in30   = new Date(now.getTime() + 30 * 86400000);
    const in60   = new Date(now.getTime() + 60 * 86400000);

    type WhereClause = {
      status?: { in: ('ACTIVE' | 'RENEWED' | 'CANCELLED')[] } | 'ACTIVE' | 'RENEWED' | 'CANCELLED';
      endDate?: { lt?: Date; gte?: Date; lte?: Date };
      projectId?: string;
      id?: { lt: string };
    };

    const where: WhereClause = {};
    if (q.projectId) where.projectId = q.projectId;
    if (q.cursor)    where.id = { lt: q.cursor };

    switch (q.window ?? 'all') {
      case 'active':
        where.status  = 'ACTIVE';
        where.endDate = { gte: in30 };
        break;
      case 'expiring30':
        where.status  = 'ACTIVE';
        where.endDate = { gte: now, lte: in30 };
        break;
      case 'expiring60':
        where.status  = 'ACTIVE';
        where.endDate = { gte: now, lte: in60 };
        break;
      case 'expired':
        where.status  = 'ACTIVE';
        where.endDate = { lt: now };
        break;
      case 'renewed':
        where.status = 'RENEWED';
        break;
      case 'cancelled':
        where.status = 'CANCELLED';
        break;
    }

    const [contracts, stats] = await req.withTenant((tx) =>
      Promise.all([
        tx.amcContract.findMany({
          where,
          orderBy: { endDate: 'asc' },
          take: limit + 1,
          select: {
            id: true, planYears: true, startDate: true, endDate: true,
            valueInr: true, status: true, notes: true, createdAt: true,
            project: { select: { id: true, number: true, systemKw: true } },
            lead:    { select: { id: true, name: true, phone: true, city: true } },
          },
        }),
        tx.amcContract.groupBy({
          by: ['status'],
          _count: true,
        }),
      ]),
    );

    // Expiring in 30d count (active only, endDate < in30)
    const expiring30Count = await req.withTenant((tx) =>
      tx.amcContract.count({ where: { status: 'ACTIVE', endDate: { gte: now, lte: in30 } } }),
    );
    const expiredCount = await req.withTenant((tx) =>
      tx.amcContract.count({ where: { status: 'ACTIVE', endDate: { lt: now } } }),
    );

    const statMap: Record<string, number> = {};
    for (const s of stats) statMap[s.status] = s._count;

    const hasMore = contracts.length > limit;
    const items   = hasMore ? contracts.slice(0, limit) : contracts;

    return reply.send({
      data: {
        contracts: items,
        hasMore,
        nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
        stats: {
          active:      statMap['ACTIVE'] ?? 0,
          renewed:     statMap['RENEWED'] ?? 0,
          cancelled:   statMap['CANCELLED'] ?? 0,
          expiring30:  expiring30Count,
          expired:     expiredCount,
        },
      },
    });
  });

  // ── GET /amc-contracts/:id ───────────────────────────────────────────────────
  app.get('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };

    const contract = await req.withTenant((tx) =>
      tx.amcContract.findUnique({
        where: { id },
        select: {
          id: true, planYears: true, startDate: true, endDate: true,
          valueInr: true, status: true, notes: true, createdAt: true, updatedAt: true,
          createdByUserId: true,
          project: { select: { id: true, number: true, systemKw: true, stage: true } },
          lead:    { select: { id: true, name: true, phone: true, city: true, email: true } },
        },
      }),
    );

    if (!contract) {
      return reply.code(404).send({ error: { code: 'amc.not_found', message: 'Contract not found' } });
    }

    // Fetch all contracts for this project to build renewal history
    const history = await req.withTenant((tx) =>
      tx.amcContract.findMany({
        where:   { projectId: contract.project.id },
        orderBy: { startDate: 'asc' },
        select:  { id: true, planYears: true, startDate: true, endDate: true, valueInr: true, status: true, createdAt: true },
      }),
    );

    // Resolve creator name
    const creator = contract.createdByUserId
      ? await req.withTenant((tx) =>
          tx.user.findUnique({ where: { id: contract.createdByUserId! }, select: { name: true } }),
        )
      : null;

    return reply.send({ data: { ...contract, createdByUserName: creator?.name ?? null, history } });
  });

  // ── POST /amc-contracts ──────────────────────────────────────────────────────
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const d = parsed.data;

    const project = await req.withTenant((tx) =>
      tx.project.findUnique({ where: { id: d.projectId }, select: { id: true, leadId: true } }),
    );
    if (!project) {
      return reply.code(404).send({ error: { code: 'project.not_found', message: 'Project not found' } });
    }

    const start   = new Date(d.startDate);
    const endDate = new Date(start);
    endDate.setFullYear(endDate.getFullYear() + d.planYears);

    const contract = await req.withTenant((tx) =>
      tx.amcContract.create({
        data: {
          tenantId:        req.auth.tenantId,
          projectId:       d.projectId,
          leadId:          project.leadId,
          planYears:       d.planYears,
          startDate:       start,
          endDate,
          createdByUserId: req.auth.userId,
          ...(d.valueInr && { valueInr: d.valueInr }),
          ...(d.notes    && { notes: d.notes }),
        },
      }),
    );

    // Denorm: keep project.amcExpiresAt in sync
    await req.withTenant((tx) =>
      tx.project.update({ where: { id: d.projectId }, data: { amcExpiresAt: endDate } }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, contractId: contract.id }, 'amc_contract.created');
    return reply.code(201).send({ data: contract });
  });

  // ── PATCH /amc-contracts/:id ─────────────────────────────────────────────────
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id }  = req.params as { id: string };
    const parsed  = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }

    const existing = await req.withTenant((tx) =>
      tx.amcContract.findUnique({ where: { id }, select: { id: true, status: true } }),
    );
    if (!existing) {
      return reply.code(404).send({ error: { code: 'amc.not_found', message: 'Contract not found' } });
    }

    const updated = await req.withTenant((tx) =>
      tx.amcContract.update({
        where: { id },
        data: {
          ...(parsed.data.status && { status: parsed.data.status }),
          ...(parsed.data.notes  !== undefined && { notes: parsed.data.notes }),
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, contractId: id }, 'amc_contract.updated');
    return reply.send({ data: updated });
  });

  // ── POST /amc-contracts/:id/renew ────────────────────────────────────────────
  app.post('/:id/renew', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = renewSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }

    const old = await req.withTenant((tx) =>
      tx.amcContract.findUnique({
        where:  { id },
        select: { id: true, projectId: true, leadId: true, endDate: true, status: true },
      }),
    );
    if (!old) {
      return reply.code(404).send({ error: { code: 'amc.not_found', message: 'Contract not found' } });
    }
    if (old.status === 'RENEWED') {
      return reply.code(409).send({ error: { code: 'amc.already_renewed', message: 'Contract already renewed' } });
    }

    const d       = parsed.data;
    const start   = new Date(old.endDate.getTime() + 86400000); // next day
    const endDate = new Date(start);
    endDate.setFullYear(endDate.getFullYear() + d.planYears);

    const [newContract] = await req.withTenant((tx) =>
      Promise.all([
        tx.amcContract.create({
          data: {
            tenantId:        req.auth.tenantId,
            projectId:       old.projectId,
            leadId:          old.leadId,
            planYears:       d.planYears,
            startDate:       start,
            endDate,
            createdByUserId: req.auth.userId,
            ...(d.valueInr && { valueInr: d.valueInr }),
            ...(d.notes    && { notes: d.notes }),
          },
        }),
        tx.amcContract.update({ where: { id }, data: { status: 'RENEWED' } }),
        tx.project.update({ where: { id: old.projectId }, data: { amcExpiresAt: endDate } }),
      ]),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, oldId: id, newId: newContract.id }, 'amc_contract.renewed');
    return reply.code(201).send({ data: newContract });
  });

  // ── GET /amc-contracts/revenue-summary ───────────────────────────────────────
  app.get('/revenue-summary', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30  * 86400000);
    const sixtyDaysOut  = new Date(now.getTime() + 60  * 86400000);
    const ninetyDaysOut = new Date(now.getTime() + 90  * 86400000);
    const yearStart     = new Date(now.getFullYear(), 0, 1);

    const [activeContracts, expiringIn30, expiringIn60, expiringIn90, expiredCount, renewedThisYear] =
      await req.withTenant((tx) =>
        Promise.all([
          tx.amcContract.findMany({ where: { status: 'ACTIVE' }, select: { valueInr: true } }),
          tx.amcContract.count({ where: { status: 'ACTIVE', endDate: { lte: thirtyDaysOut, gte: now } } }),
          tx.amcContract.count({ where: { status: 'ACTIVE', endDate: { lte: sixtyDaysOut,  gte: now } } }),
          tx.amcContract.count({ where: { status: 'ACTIVE', endDate: { lte: ninetyDaysOut, gte: now } } }),
          tx.amcContract.count({ where: { status: 'ACTIVE', endDate: { lt: now } } }),
          tx.amcContract.findMany({ where: { status: 'RENEWED', updatedAt: { gte: yearStart } }, select: { valueInr: true } }),
        ]),
      );

    const totalActiveValueInr = activeContracts.reduce(
      (s, c) => s + (c.valueInr !== null ? Number(c.valueInr) : 0),
      0,
    );
    const renewedThisYearValueInr = renewedThisYear.reduce(
      (s, c) => s + (c.valueInr !== null ? Number(c.valueInr) : 0),
      0,
    );

    return reply.send({
      data: {
        totalActive:            activeContracts.length,
        totalActiveValueInr,
        expiringIn30,
        expiringIn60,
        expiringIn90,
        expiredCount,
        renewedThisYearCount:   renewedThisYear.length,
        renewedThisYearValueInr,
      },
    });
  });
};
