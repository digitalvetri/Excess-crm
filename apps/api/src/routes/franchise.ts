import type { FastifyPluginAsync } from 'fastify';
import { prisma, Prisma, withSystemContext, SYSTEM_TENANT_ID } from '@excess/db';
import { env } from '@excess/config';
import { can } from '@excess/shared';
import { z } from 'zod';
import crypto from 'node:crypto';
import argon2 from 'argon2';

// Commission slabs feed computeCommission, which silently falls back to a 5% default on a
// malformed shape. Validate on write so bad slabs are rejected (400), not silently ignored:
// keys must be 'perKwInr' or a numeric deal-value threshold; values are non-negative numbers.
const commissionSlabsSchema = z.record(
  z.string().regex(/^(perKwInr|\d+)$/, 'slab key must be "perKwInr" or a numeric threshold'),
  z.number().nonnegative(),
);

const createFranchiseSchema = z.object({
  name: z.string().min(2).max(200),
  tier: z.enum(['BRONZE', 'SILVER', 'GOLD']).optional(),
  territory: z.record(z.unknown()).optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  gstNumber: z.string().optional(),
  commissionSlabs: commissionSlabsSchema.optional(),
  agentSplitConfig: z.record(z.number().min(0).max(100)).optional(),
  bankAccount: z.record(z.unknown()).optional(),
});

const patchFranchiseSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  tier: z.enum(['BRONZE', 'SILVER', 'GOLD']).optional(),
  territory: z.record(z.unknown()).optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  gstNumber: z.string().optional(),
  commissionSlabs: commissionSlabsSchema.optional(),
  agentSplitConfig: z.record(z.number().min(0).max(100)).optional(),
  bankAccount: z.record(z.unknown()).optional(),
});

export const franchiseRoutes: FastifyPluginAsync = async (app) => {
  // GET /franchise/summary — network-wide KPIs (total active, pending commissions, etc.)
  app.get('/summary', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const [byStatus, pendingComm] = await req.withTenant(async (tx) =>
      Promise.all([
        tx.tenant.groupBy({
          by: ['status'],
          where: { type: 'FRANCHISE', deletedAt: null },
          _count: true,
        }),
        tx.commission.aggregate({
          where: { status: 'PENDING_APPROVAL' },
          _sum: { netPayableInr: true },
          _count: true,
        }),
      ]),
    );

    const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count]));

    return reply.send({
      data: {
        total:      byStatus.reduce((s, r) => s + r._count, 0),
        active:     counts['ACTIVE']     ?? 0,
        onboarding: counts['ONBOARDING'] ?? 0,
        suspended:  counts['SUSPENDED']  ?? 0,
        probation:  counts['PROBATION']  ?? 0,
        pendingCommissionCount: pendingComm._count,
        pendingCommissionInr:   pendingComm._sum.netPayableInr?.toString() ?? '0',
      },
    });
  });

  // GET /franchise — list all franchise tenants
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const franchises = await req.withTenant(async (tx) =>
      tx.tenant.findMany({
        where: { type: 'FRANCHISE', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, type: true, status: true, tier: true,
          contactName: true, contactEmail: true, contactPhone: true,
          territory: true, createdAt: true,
          _count: { select: { users: true, leads: true } },
        },
      }),
    );

    return reply.send({ data: franchises });
  });

  // GET /franchise/:id
  app.get('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    // Non-ADMIN callers may only read their own tenant; ADMIN (HQ) may read any.
    if (req.auth.role !== 'ADMIN' && id !== req.auth.tenantId) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const franchise = await req.withTenant(async (tx) =>
      tx.tenant.findUnique({
        where: { id, type: 'FRANCHISE' },
        select: {
          id: true, name: true, status: true, tier: true, territory: true,
          commissionSlabs: true, agentSplitConfig: true,
          contactName: true, contactEmail: true,
          contactPhone: true, gstNumber: true, bankAccount: true, createdAt: true,
          _count: { select: { users: true, leads: true, commissions: true } },
        },
      }),
    );

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

    const { name, tier, territory, contactName, contactEmail, contactPhone, gstNumber, commissionSlabs, agentSplitConfig, bankAccount } = parsed.data;

    const franchise = await req.withTenant(async (tx) =>
      tx.tenant.create({
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
          ...(agentSplitConfig !== undefined && { agentSplitConfig: agentSplitConfig as Prisma.InputJsonValue }),
          ...(bankAccount !== undefined && { bankAccount: bankAccount as Prisma.InputJsonValue }),
        },
      }),
    );

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

    const franchise = await req.withTenant(async (tx) =>
      tx.tenant.update({
        where: { id, type: 'FRANCHISE' },
        data: rawData as Parameters<typeof tx.tenant.update>[0]['data'],
      }),
    );

    req.log.info({ userId: req.auth.userId, franchiseId: id }, 'franchise.updated');
    return reply.send({ data: franchise });
  });

  // POST /franchise/:id/activate
  app.post('/:id/activate', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const activated = await req.withTenant(async (tx) => {
      const existing = await tx.tenant.findUnique({ where: { id, type: 'FRANCHISE', deletedAt: null }, select: { id: true } });
      if (!existing) return null;
      return tx.tenant.update({ where: { id, type: 'FRANCHISE' }, data: { status: 'ACTIVE' } });
    });
    if (!activated) return reply.code(404).send({ error: { code: 'franchise.not_found', message: 'Franchise not found' } });
    req.log.info({ userId: req.auth.userId, franchiseId: id }, 'franchise.activated');
    return reply.send({ data: { success: true, status: 'ACTIVE' } });
  });

  // POST /franchise/:id/suspend
  app.post('/:id/suspend', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.suspend')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const suspended = await req.withTenant(async (tx) => {
      const existing = await tx.tenant.findUnique({ where: { id, type: 'FRANCHISE', deletedAt: null }, select: { id: true } });
      if (!existing) return null;
      return tx.tenant.update({ where: { id, type: 'FRANCHISE' }, data: { status: 'SUSPENDED' } });
    });
    if (!suspended) return reply.code(404).send({ error: { code: 'franchise.not_found', message: 'Franchise not found' } });
    req.log.info({ userId: req.auth.userId, franchiseId: id }, 'franchise.suspended');
    return reply.send({ data: { success: true, status: 'SUSPENDED' } });
  });

  // POST /franchise/:id/probation — place an active franchise on probation
  app.post('/:id/probation', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.suspend')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const updated = await req.withTenant(async (tx) => {
      const existing = await tx.tenant.findUnique({ where: { id, type: 'FRANCHISE', deletedAt: null }, select: { id: true } });
      if (!existing) return null;
      return tx.tenant.update({ where: { id, type: 'FRANCHISE' }, data: { status: 'PROBATION' } });
    });
    if (!updated) return reply.code(404).send({ error: { code: 'franchise.not_found', message: 'Franchise not found' } });
    req.log.info({ userId: req.auth.userId, franchiseId: id }, 'franchise.probation');
    return reply.send({ data: { success: true, status: 'PROBATION' } });
  });

  // POST /franchise/:id/terminate
  app.post('/:id/terminate', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.terminate')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const terminated = await req.withTenant(async (tx) => {
      const existing = await tx.tenant.findUnique({ where: { id, type: 'FRANCHISE', deletedAt: null }, select: { id: true } });
      if (!existing) return null;
      return tx.tenant.update({ where: { id, type: 'FRANCHISE' }, data: { status: 'TERMINATED', deletedAt: new Date() } });
    });
    if (!terminated) return reply.code(404).send({ error: { code: 'franchise.not_found', message: 'Franchise not found' } });
    req.log.info({ userId: req.auth.userId, franchiseId: id }, 'franchise.terminated');
    return reply.send({ data: { success: true, status: 'TERMINATED' } });
  });

  // GET /franchise/leaderboard — city-by-city rankings (period: month | quarter | year)
  app.get('/leaderboard', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.leaderboard')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { period?: 'month' | 'quarter' | 'year' };
    const now   = new Date();
    const since = new Date(now);

    if (query.period === 'year') {
      since.setFullYear(now.getFullYear(), 0, 1);
      since.setHours(0, 0, 0, 0);
    } else if (query.period === 'quarter') {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      since.setMonth(qStart, 1);
      since.setHours(0, 0, 0, 0);
    } else {
      since.setDate(1);
      since.setHours(0, 0, 0, 0);
    }

    const { franchises, leadStats, convertedStats, commissionStats } = await req.withTenant(async (tx) => {
      const franchises = await tx.tenant.findMany({
        where: { type: 'FRANCHISE', deletedAt: null },
        select: {
          id: true, name: true, tier: true, status: true, territory: true,
          _count: { select: { users: true } },
        },
      });

      const franchiseIds = franchises.map((f) => f.id);

      const [leadStats, convertedStats, commissionStats] = await Promise.all([
        tx.lead.groupBy({
          by: ['tenantId'],
          where: { tenantId: { in: franchiseIds }, receivedAt: { gte: since } },
          _count: { id: true },
        }),
        tx.lead.groupBy({
          by: ['tenantId'],
          where: { tenantId: { in: franchiseIds }, stage: 'CONVERTED', stageChangedAt: { gte: since } },
          _count: { id: true },
        }),
        tx.commission.groupBy({
          by: ['tenantId'],
          where: { tenantId: { in: franchiseIds }, status: { in: ['APPROVED', 'PAID'] }, createdAt: { gte: since } },
          _sum: { netPayableInr: true },
        }),
      ]);

      return { franchises, leadStats, convertedStats, commissionStats };
    });

    const leadMap      = new Map(leadStats.map((s) => [s.tenantId, s._count.id]));
    const convertedMap = new Map(convertedStats.map((s) => [s.tenantId, s._count.id]));
    const commMap      = new Map(commissionStats.map((s) => [s.tenantId, Number(s._sum.netPayableInr ?? 0)]));

    const ranked = franchises
      .map((f) => {
        const leads     = leadMap.get(f.id) ?? 0;
        const converted = convertedMap.get(f.id) ?? 0;
        const territory = f.territory as Record<string, unknown> | null;
        return {
          id:             f.id,
          name:           f.name,
          tier:           f.tier,
          status:         f.status,
          city:           (territory?.['city'] as string | undefined) ?? null,
          state:          (territory?.['state'] as string | undefined) ?? null,
          agentCount:     f._count.users,
          leadsReceived:  leads,
          dealsClosed:    converted,
          conversionRate: leads > 0 ? Math.round((converted / leads) * 100) : 0,
          revenueInr:     commMap.get(f.id) ?? 0,
        };
      })
      .sort((a, b) => b.revenueInr - a.revenueInr || b.dealsClosed - a.dealsClosed);

    return reply.send({ data: { period: query.period ?? 'month', since, franchises: ranked } });
  });

  // GET /franchise/:id/agents — list agents in a franchise with role + stats
  app.get('/:id/agents', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.agents.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    // Non-ADMIN callers may only read agents of their own tenant; ADMIN may read any.
    if (req.auth.role !== 'ADMIN' && id !== req.auth.tenantId) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { enriched, pendingInvites } = await req.withTenant(async (tx) => {
      const [agents, leadStats, splitStats, pendingInvites] = await Promise.all([
        tx.user.findMany({
          where: { tenantId: id, isActive: true },
          select: { id: true, name: true, email: true, phone: true, role: true, agentRole: true, createdAt: true },
        }),
        tx.lead.groupBy({
          by: ['ownerUserId'],
          where: { tenantId: id, ownerUserId: { not: null }, receivedAt: { gte: monthStart } },
          _count: { id: true },
        }),
        tx.commissionSplit.groupBy({
          by: ['userId'],
          where: { tenantId: id },
          _sum: { amountInr: true },
          _count: { id: true },
        }),
        tx.franchiseInvite.findMany({
          where: { tenantId: id, acceptedAt: null, expiresAt: { gte: new Date() } },
          select: { id: true, email: true, name: true, agentRole: true, createdAt: true, expiresAt: true },
        }),
      ]);

      const leadMap  = new Map(leadStats.map((s) => [s.ownerUserId!, s._count.id]));
      const splitMap = new Map(splitStats.map((s) => [s.userId, { count: s._count.id, earned: Number(s._sum.amountInr ?? 0) }]));

      const enriched = agents.map((a) => ({
        ...a,
        leadsThisMonth: leadMap.get(a.id) ?? 0,
        splitsCount:    splitMap.get(a.id)?.count  ?? 0,
        totalEarnedInr: splitMap.get(a.id)?.earned ?? 0,
      }));

      return { enriched, pendingInvites };
    });

    return reply.send({ data: { agents: enriched, pendingInvites } });
  });

  // POST /franchise/:id/agents/invite — invite an agent by email
  app.post('/:id/agents/invite', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.agents.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const inviteSchema = z.object({
      email:     z.string().email(),
      name:      z.string().min(2),
      agentRole: z.enum(['OWNER', 'SALES', 'SURVEY', 'FOLLOWUP']),
    });

    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { email, name, agentRole } = parsed.data;
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const result = await req.withTenant(async (tx) => {
      const franchise = await tx.tenant.findUnique({ where: { id, type: 'FRANCHISE' }, select: { name: true } });
      if (!franchise) return { error: 'not_found' as const };

      // Revoke any existing pending invite for this email+franchise
      await tx.franchiseInvite.deleteMany({ where: { tenantId: id, email, acceptedAt: null } });

      const invite = await tx.franchiseInvite.create({
        data: { tenantId: id, email, name, agentRole, token, expiresAt },
      });

      return { invite, franchiseName: franchise.name };
    });

    if ('error' in result) {
      return reply.code(404).send({ error: { code: 'franchise.not_found', message: 'Franchise not found' } });
    }

    const { invite, franchiseName } = result;
    const acceptUrl = `${env.APP_URL}/onboard/agent/${token}`;

    await app.queues.emailSend.add('franchise-agent-invite', {
      tenantId: id,
      to: email,
      subject: `You're invited to join ${franchiseName} on Excess CRM`,
      template: 'FRANCHISE_INVITE',
      vars: { name, franchiseName, agentRole, acceptUrl },
    });

    req.log.info({ userId: req.auth.userId, franchiseId: id, inviteId: invite.id, agentRole }, 'franchise.agent.invited');
    return reply.code(201).send({ data: { invite, acceptUrl } });
  });

  // PATCH /franchise/:id/agents/:userId — update agent role or deactivate
  app.patch('/:id/agents/:userId', async (req, reply) => {
    if (!can(req.auth.role, 'franchise.agents.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id, userId } = req.params as { id: string; userId: string };
    const patchSchema = z.object({
      agentRole: z.enum(['OWNER', 'SALES', 'SURVEY', 'FOLLOWUP']).optional(),
      isActive:  z.boolean().optional(),
    });

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const user = await req.withTenant(async (tx) =>
      tx.user.update({
        where: { id: userId, tenantId: id },
        data: {
          ...(parsed.data.agentRole !== undefined && { agentRole: parsed.data.agentRole }),
          ...(parsed.data.isActive  !== undefined && { isActive: parsed.data.isActive }),
        },
        select: { id: true, name: true, email: true, role: true, agentRole: true, isActive: true },
      }),
    );

    req.log.info({ userId: req.auth.userId, franchiseId: id, targetUserId: userId }, 'franchise.agent.updated');
    return reply.send({ data: user });
  });

  // GET /franchise/agents/accept/:token — accept an agent invite (returns invite details for UI).
  // Public + token-gated: the invitee has no account yet, so this runs pre-auth.
  app.get('/agents/accept/:token', { config: { public: true } }, async (req, reply) => {
    const { token } = req.params as { token: string };

    const invite = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
      tx.franchiseInvite.findUnique({
        where: { token },
        include: { tenant: { select: { name: true, territory: true } } },
      }),
    );

    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      return reply.code(404).send({ error: { code: 'invite.invalid', message: 'Invite is invalid or expired' } });
    }

    return reply.send({
      data: {
        franchiseName: invite.tenant.name,
        territory:     invite.tenant.territory,
        email:         invite.email,
        name:          invite.name,
        agentRole:     invite.agentRole,
        expiresAt:     invite.expiresAt,
      },
    });
  });

  // POST /franchise/agents/accept/:token — complete acceptance (create user account).
  // Public + token-gated: pre-auth, since the invitee is creating their login here.
  app.post('/agents/accept/:token', { config: { public: true } }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const acceptSchema = z.object({ password: z.string().min(8) });

    const parsed = acceptSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Password must be at least 8 characters' } });
    }

    const invite = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
      tx.franchiseInvite.findUnique({ where: { token } }),
    );
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      return reply.code(404).send({ error: { code: 'invite.invalid', message: 'Invite is invalid or expired' } });
    }

    const passwordHash = await argon2.hash(parsed.data.password);

    const userRole = invite.agentRole === 'OWNER' ? 'FRANCHISE_OWNER' as const : 'FRANCHISE_USER' as const;

    const user = await withSystemContext(prisma, invite.tenantId, async (tx) => {
      const u = await tx.user.create({
        data: {
          tenantId:     invite.tenantId,
          email:        invite.email,
          name:         invite.name,
          agentRole:    invite.agentRole,
          role:         userRole,
          passwordHash,
        },
        select: { id: true, name: true, email: true, role: true, agentRole: true },
      });
      await tx.franchiseInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      return u;
    });

    req.log.info({ franchiseId: invite.tenantId, userId: user.id }, 'franchise.agent.accepted');
    return reply.code(201).send({ data: user });
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
