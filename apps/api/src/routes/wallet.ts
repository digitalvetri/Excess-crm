import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { z } from 'zod';

const createTransactionSchema = z.object({
  type: z.enum(['CREDIT', 'DEBIT']),
  amountInr: z.number().positive(),
  description: z.string().min(1),
  referenceId: z.string().optional(),
});

export const walletRoutes: FastifyPluginAsync = async (app) => {
  // GET /wallet — get wallet for tenant (upsert if not exists) + recent transactions
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'wallet.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { wallet, transactions } = await req.withTenant(async (tx) => {
      const w = await tx.wallet.upsert({
        where: { tenantId: req.auth.tenantId },
        update: {},
        create: { tenantId: req.auth.tenantId, balanceInr: 0 },
      });

      const txns = await tx.walletTransaction.findMany({
        where: { walletId: w.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      return { wallet: w, transactions: txns };
    });

    return reply.send({ data: { wallet, transactions } });
  });

  // GET /wallet/transactions — paginated transaction list
  app.get('/transactions', async (req, reply) => {
    if (!can(req.auth.role, 'wallet.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { cursor?: string };
    const take = 20;

    const transactions = await req.withTenant(async (tx) => {
      // Ensure wallet exists so we have a walletId to filter on
      const wallet = await tx.wallet.upsert({
        where: { tenantId: req.auth.tenantId },
        update: {},
        create: { tenantId: req.auth.tenantId, balanceInr: 0 },
      });

      return tx.walletTransaction.findMany({
        where: {
          walletId: wallet.id,
          ...(query.cursor && { createdAt: { lt: new Date(query.cursor) } }),
        },
        orderBy: { createdAt: 'desc' },
        take: take + 1,
      });
    });

    const hasMore = transactions.length > take;
    const items = hasMore ? transactions.slice(0, take) : transactions;
    const nextCursor = hasMore ? (items.at(-1)?.createdAt.toISOString() ?? null) : null;

    return reply.send({ data: { transactions: items, hasMore, nextCursor } });
  });

  // POST /wallet/transactions — create manual transaction (ADMIN only)
  app.post('/transactions', async (req, reply) => {
    if (!can(req.auth.role, 'wallet.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { type, amountInr, description, referenceId } = parsed.data;

    const result = await req.withTenant(async (tx) => {
      // Upsert wallet to ensure it exists
      const wallet = await tx.wallet.upsert({
        where: { tenantId: req.auth.tenantId },
        update: {},
        create: { tenantId: req.auth.tenantId, balanceInr: 0 },
      });

      let updatedWallet: typeof wallet;

      if (type === 'DEBIT') {
        // Atomic balance check + decrement prevents overdraft under concurrent requests
        const affected = await tx.$executeRaw`
          UPDATE wallets
          SET balance_inr = balance_inr - ${amountInr}
          WHERE id = ${wallet.id}::uuid
            AND balance_inr >= ${amountInr}
        `;
        if (affected === 0) return { error: 'insufficient_balance' as const };
        updatedWallet = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      } else {
        updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: { balanceInr: { increment: amountInr } },
        });
      }

      // Create the transaction record
      const txnData = Object.fromEntries(
        Object.entries({
          walletId: updatedWallet.id,
          tenantId: req.auth.tenantId,
          type,
          amountInr,
          description,
          referenceId,
        }).filter(([, v]) => v !== undefined),
      ) as {
        walletId: string;
        tenantId: string;
        type: 'CREDIT' | 'DEBIT';
        amountInr: number;
        description: string;
        referenceId?: string;
      };

      const walletTxn = await tx.walletTransaction.create({ data: txnData });

      return { wallet: updatedWallet, transaction: walletTxn };
    });

    if ('error' in result) {
      return reply.code(422).send({
        error: { code: 'wallet.insufficient_balance', message: 'Insufficient balance' },
      });
    }

    req.log.info(
      {
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        transactionId: result.transaction.id,
        type,
        amountInr,
      },
      'wallet.transaction_created',
    );
    return reply.code(201).send({ data: result.transaction });
  });
};
