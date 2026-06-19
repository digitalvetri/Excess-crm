import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { z } from 'zod';

const createReferralSchema = z.object({
  referrerId: z.string().uuid(),
  referredLeadId: z.string().uuid(),
});

const patchReferralSchema = z.object({
  status: z.literal('CONVERTED'),
});

const rewardReferralSchema = z.object({
  rewardInr: z.number().positive(),
});

export const referralsRoutes: FastifyPluginAsync = async (app) => {
  // GET /referrals/summary — counts by status + total reward paid
  app.get('/summary', async (req, reply) => {
    if (!can(req.auth.role, 'referrals.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const [byStatus, rewardSum] = await req.withTenant(async (tx) =>
      Promise.all([
        tx.referral.groupBy({ by: ['status'], _count: true }),
        tx.referral.aggregate({ where: { status: 'REWARDED' }, _sum: { rewardInr: true } }),
      ]),
    );

    const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count]));
    return reply.send({
      data: {
        total:     byStatus.reduce((s, r) => s + r._count, 0),
        pending:   counts['PENDING']   ?? 0,
        converted: counts['CONVERTED'] ?? 0,
        rewarded:  counts['REWARDED']  ?? 0,
        totalRewardInr: rewardSum._sum.rewardInr?.toString() ?? '0',
      },
    });
  });

  // GET /referrals/ambassadors — top referrers with tier badges
  app.get('/ambassadors', async (req, reply) => {
    if (!can(req.auth.role, 'referrals.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const referrals = await req.withTenant(async (tx) =>
      tx.referral.groupBy({
        by: ['referrerId'],
        _count: { _all: true },
        where: { status: { in: ['CONVERTED', 'REWARDED'] } },
        orderBy: { _count: { referrerId: 'desc' } },
        take: 50,
      }),
    );

    if (referrals.length === 0) {
      return reply.send({ data: [] });
    }

    const referrerIds = referrals.map((r) => r.referrerId);
    const leads = await req.withTenant((tx) =>
      tx.lead.findMany({
        where: { id: { in: referrerIds } },
        select: { id: true, name: true, phone: true, city: true },
      }),
    );

    const leadMap = new Map(leads.map((l) => [l.id, l]));

    function tier(count: number): 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' {
      if (count >= 10) return 'PLATINUM';
      if (count >= 5)  return 'GOLD';
      if (count >= 3)  return 'SILVER';
      return 'BRONZE';
    }

    const ambassadors = referrals.map((r, idx) => ({
      rank:        idx + 1,
      referrerId:  r.referrerId,
      referrer:    leadMap.get(r.referrerId) ?? null,
      referralCount: r._count._all,
      tier:        tier(r._count._all),
    }));

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId }, 'referrals.ambassadors');
    return reply.send({ data: ambassadors });
  });

  // GET /referrals — list referrals with referrer lead name enrichment
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'referrals.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { status?: string };

    const enriched = await req.withTenant(async (tx) => {
      const referrals = await tx.referral.findMany({
        where: { ...(query.status && { status: query.status as never }) },
        orderBy: { createdAt: 'desc' },
        include: { referredLead: { select: { name: true, phone: true, stage: true } } },
      });

      // Enrich with referrer name (referrerId is a lead UUID)
      const referrerIds = [...new Set(referrals.map((r) => r.referrerId))];
      const referrerLeads = referrerIds.length > 0
        ? await tx.lead.findMany({
            where: { id: { in: referrerIds } },
            select: { id: true, name: true, phone: true },
          })
        : [];
      const referrerMap = new Map(referrerLeads.map((l) => [l.id, l]));

      return referrals.map((r) => ({
        ...r,
        referrer: referrerMap.get(r.referrerId) ?? null,
      }));
    });

    return reply.send({ data: enriched });
  });

  // POST /referrals — create a referral
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'referrals.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createReferralSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { referrerId, referredLeadId } = parsed.data;

    const referral = await req.withTenant(async (tx) => {
      // Verify the referred lead belongs to this tenant (RLS scopes the query)
      const lead = await tx.lead.findUnique({
        where: { id: referredLeadId },
        select: { id: true },
      });

      if (!lead) {
        return null;
      }

      return tx.referral.create({
        data: {
          tenantId: req.auth.tenantId,
          referrerId,
          referredLeadId,
          status: 'PENDING',
        },
      });
    });

    if (referral === null) {
      return reply.code(404).send({ error: { code: 'lead.not_found', message: 'Referred lead not found' } });
    }

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId, referralId: referral.id },
      'referral.created',
    );
    return reply.code(201).send({ data: referral });
  });

  // PATCH /referrals/:id — update status PENDING→CONVERTED
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'referrals.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = patchReferralSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const referral = await req.withTenant(async (tx) => {
      // Use updateMany with status guard to prevent invalid transitions atomically
      const { count } = await tx.referral.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'CONVERTED' },
      });

      if (count === 0) return null;

      // Return the full updated record
      return tx.referral.findUnique({ where: { id } });
    });

    if (!referral) {
      // Either not found in tenant or not in PENDING state
      return reply.code(409).send({
        error: { code: 'referral.invalid_transition', message: 'Referral not found or not in PENDING status' },
      });
    }

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId, referralId: id },
      'referral.converted',
    );
    return reply.send({ data: referral });
  });

  // POST /referrals/:id/reward — mark as REWARDED and credit wallet (ADMIN only)
  app.post('/:id/reward', async (req, reply) => {
    if (!can(req.auth.role, 'referrals.reward')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = rewardReferralSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { rewardInr } = parsed.data;

    const result = await req.withTenant(async (tx) => {
      // Verify referral exists and is CONVERTED
      const existing = await tx.referral.findUnique({ where: { id }, select: { id: true, status: true, tenantId: true } });
      if (!existing) return { error: 'not_found' as const };
      if (existing.status !== 'CONVERTED') return { error: 'invalid_status' as const };

      // Credit the franchise that owns the referral, not the HQ caller
      const referralTenantId = existing.tenantId;

      // Update referral to REWARDED
      const referral = await tx.referral.update({
        where: { id },
        data: {
          status: 'REWARDED',
          rewardInr,
          rewardedAt: new Date(),
        },
      });

      // Upsert wallet for the franchise tenant
      const wallet = await tx.wallet.upsert({
        where: { tenantId: referralTenantId },
        update: { balanceInr: { increment: rewardInr } },
        create: { tenantId: referralTenantId, balanceInr: rewardInr },
      });

      // Create wallet transaction
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          tenantId: referralTenantId,
          type: 'CREDIT',
          amountInr: rewardInr,
          description: 'Referral reward',
          referenceId: referral.id,
        },
      });

      return { referral };
    });

    if ('error' in result) {
      if (result.error === 'not_found') {
        return reply.code(404).send({ error: { code: 'referral.not_found', message: 'Referral not found' } });
      }
      return reply.code(409).send({
        error: { code: 'referral.invalid_transition', message: 'Referral must be CONVERTED before rewarding' },
      });
    }

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId, referralId: id, rewardInr },
      'referral.rewarded',
    );
    return reply.send({ data: result.referral });
  });

  // POST /referrals/:id/auto-reward — derive tier reward from referred lead stage and credit wallet
  app.post('/:id/auto-reward', async (req, reply) => {
    if (!can(req.auth.role, 'referrals.reward')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };

    const result = await req.withTenant(async (tx) => {
      const referral = await tx.referral.findUnique({
        where: { id },
        select: { id: true, status: true, tenantId: true, referredLeadId: true },
      });
      if (!referral) return { error: 'not_found' as const };
      if (referral.status !== 'CONVERTED') return { error: 'invalid_status' as const };

      // Derive reward slab from referred lead's current stage
      const lead = await tx.lead.findUnique({
        where: { id: referral.referredLeadId },
        select: { stage: true },
      });

      let rewardInr = 500;
      if (lead?.stage === 'CONVERTED') {
        rewardInr = 5000;
      } else if (lead?.stage === 'QUALIFIED' || lead?.stage === 'FOLLOW_UP') {
        rewardInr = 2000;
      }

      const referralTenantId = referral.tenantId;

      const updated = await tx.referral.update({
        where: { id },
        data: { status: 'REWARDED', rewardInr, rewardedAt: new Date() },
      });

      const wallet = await tx.wallet.upsert({
        where: { tenantId: referralTenantId },
        update: { balanceInr: { increment: rewardInr } },
        create: { tenantId: referralTenantId, balanceInr: rewardInr },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          tenantId: referralTenantId,
          type: 'CREDIT',
          amountInr: rewardInr,
          description: `Auto-reward (${lead?.stage ?? 'UNKNOWN'})`,
          referenceId: updated.id,
        },
      });

      return { referral: updated, rewardInr };
    });

    if ('error' in result) {
      if (result.error === 'not_found') {
        return reply.code(404).send({ error: { code: 'referral.not_found', message: 'Referral not found' } });
      }
      return reply.code(409).send({
        error: { code: 'referral.invalid_transition', message: 'Referral must be CONVERTED before rewarding' },
      });
    }

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId, referralId: id, rewardInr: result.rewardInr },
      'referral.auto_rewarded',
    );
    return reply.send({ data: result.referral });
  });
};
