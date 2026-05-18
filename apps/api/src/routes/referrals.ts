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
  // GET /referrals — list referrals for tenant, optional ?status= filter
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'referrals.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { status?: string };

    const referrals = await req.withTenant(async (tx) =>
      tx.referral.findMany({
        where: {
          ...(query.status && { status: query.status as never }),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          referredLead: {
            select: { name: true, phone: true, stage: true },
          },
        },
      }),
    );

    return reply.send({ data: referrals });
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
      const existing = await tx.referral.findUnique({ where: { id }, select: { id: true, status: true } });
      if (!existing) return { error: 'not_found' as const };
      if (existing.status !== 'CONVERTED') return { error: 'invalid_status' as const };

      // Update referral to REWARDED
      const referral = await tx.referral.update({
        where: { id },
        data: {
          status: 'REWARDED',
          rewardInr,
          rewardedAt: new Date(),
        },
      });

      // Upsert wallet for tenant
      const wallet = await tx.wallet.upsert({
        where: { tenantId: req.auth.tenantId },
        update: { balanceInr: { increment: rewardInr } },
        create: { tenantId: req.auth.tenantId, balanceInr: rewardInr },
      });

      // Create wallet transaction
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          tenantId: req.auth.tenantId,
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
};
