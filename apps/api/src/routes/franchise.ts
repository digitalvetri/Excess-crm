import type { FastifyPluginAsync } from 'fastify';
import { prisma, Prisma } from '@excess/db';
import { can } from '@excess/shared';
import { z } from 'zod';

const createFranchiseSchema = z.object({
  name: z.string().min(2).max(200),
  tier: z.enum(['BRONZE', 'SILVER', 'GOLD']).optional(),
  territory: z.record(z.unknown()).optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  gstNumber: z.string().optional(),
  commissionSlabs: z.record(z.unknown()).optional(),
});

const patchFranchiseSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  tier: z.enum(['BRONZE', 'SILVER', 'GOLD']).optional(),
  territory: z.record(z.unknown()).optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  gstNumber: z.string().optional(),
  commissionSlabs: z.record(z.unknown()).optional(),
  bankAccount: z.record(z.unknown()).optional(),
});

export const franchiseRoutes: FastifyPluginAsync = async (app) => {
  // GET /franchise — list all franchise tenants
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const franchises = await prisma.tenant.findMany({
      where: { type: 'FRANCHISE', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, type: true, status: true, tier: true,
        contactName: true, contactEmail: true, contactPhone: true,
        territory: true, createdAt: true,
        _count: { select: { users: true, leads: true } },
      },
    });

    return reply.send({ data: franchises });
  });

  // GET /franchise/:id
  app.get('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const franchise = await prisma.tenant.findUnique({
      where: { id, type: 'FRANCHISE' },
      select: {
        id: true, name: true, status: true, tier: true, territory: true,
        commissionSlabs: true, contactName: true, contactEmail: true,
        contactPhone: true, gstNumber: true, bankAccount: true, createdAt: true,
        _count: { select: { users: true, leads: true, commissions: true } },
      },
    });

    if (!franchise) {
      return reply.code(404).send({ error: { code: 'franchise.not_found', message: 'Franchise not found' } });
    }

    return reply.send({ data: franchise });
  });

  // POST /franchise — onboard new franchise
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createFranchiseSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { name, tier, territory, contactName, contactEmail, contactPhone, gstNumber, commissionSlabs } = parsed.data;

    const franchise = await prisma.tenant.create({
      data: {
        name,
        type: 'FRANCHISE',
        status: 'ONBOARDING',
        ...(tier !== undefined && { tier }),
        ...(territory !== undefined && { territory: territory as Prisma.InputJsonValue }),
        ...(contactName !== undefined && { contactName }),
        ...(contactEmail !== undefined && { contactEmail }),
        ...(contactPhone !== undefined && { contactPhone }),
        ...(gstNumber !== undefined && { gstNumber }),
        ...(commissionSlabs !== undefined && { commissionSlabs: commissionSlabs as Prisma.InputJsonValue }),
      },
    });

    req.log.info({ userId: req.auth.userId, franchiseId: franchise.id }, 'franchise.created');
    return reply.code(201).send({ data: franchise });
  });

  // PATCH /franchise/:id
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = patchFranchiseSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const rawData = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    ) as Record<string, unknown>;

    if (Object.keys(rawData).length === 0) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No fields to update' } });
    }

    const franchise = await prisma.tenant.update({
      where: { id },
      data: rawData as Parameters<typeof prisma.tenant.update>[0]['data'],
    });

    req.log.info({ userId: req.auth.userId, franchiseId: id }, 'franchise.updated');
    return reply.send({ data: franchise });
  });

  // POST /franchise/:id/activate
  app.post('/:id/activate', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    await prisma.tenant.update({ where: { id }, data: { status: 'ACTIVE' } });
    req.log.info({ userId: req.auth.userId, franchiseId: id }, 'franchise.activated');
    return reply.send({ data: { success: true, status: 'ACTIVE' } });
  });

  // POST /franchise/:id/suspend
  app.post('/:id/suspend', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.suspend')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    await prisma.tenant.update({ where: { id }, data: { status: 'SUSPENDED' } });
    req.log.info({ userId: req.auth.userId, franchiseId: id }, 'franchise.suspended');
    return reply.send({ data: { success: true, status: 'SUSPENDED' } });
  });

  // POST /franchise/:id/terminate
  app.post('/:id/terminate', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.terminate')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    await prisma.tenant.update({
      where: { id },
      data: { status: 'TERMINATED', deletedAt: new Date() },
    });
    req.log.info({ userId: req.auth.userId, franchiseId: id }, 'franchise.terminated');
    return reply.send({ data: { success: true, status: 'TERMINATED' } });
  });

  // GET /franchise/:id/stats — performance metrics
  app.get('/:id/stats', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };

    const [totalLeads, convertedLeads, totalCommissions, pendingCommissions, commissionSum] =
      await req.withTenant(async (tx) =>
        Promise.all([
          tx.lead.count({ where: { tenantId: id } }),
          tx.lead.count({ where: { tenantId: id, stage: 'CONVERTED' } }),
          tx.commission.count({ where: { tenantId: id } }),
          tx.commission.count({ where: { tenantId: id, status: 'PENDING_APPROVAL' } }),
          tx.commission.aggregate({
            where: { tenantId: id, status: { in: ['APPROVED', 'PAID'] } },
            _sum: { netPayableInr: true },
          }),
        ]),
      );

    return reply.send({
      data: {
        totalLeads,
        convertedLeads,
        conversionRate: totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0,
        totalCommissions,
        pendingCommissions,
        totalEarnedInr: commissionSum._sum?.netPayableInr?.toString() ?? '0',
      },
    });
  });
};
