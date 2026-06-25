/**
 * Wallet + Payout — money-path integration tests (report 2.3).
 * Invariants of INTENDED behaviour, against the real DB. Requires docker-compose up.
 * A failure here is a real money bug, not a snapshot to soften.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { prisma, withSystemContext } from '@excess/db';

const HQ = 'aaaaaaaa-0000-0000-0000-000000000001';
let app: FastifyInstance;
let adminCookie = '';
let employeeCookie = '';

async function login(email: string, password: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
  const c = res.cookies.find((x) => x.name === 'excess_session');
  return c ? `excess_session=${c.value}` : '';
}

function authed(cookie: string, method: string, url: string, payload?: object) {
  return app.inject({ method: method as never, url, headers: { cookie }, ...(payload && { payload }) });
}

async function walletBalance(): Promise<number> {
  const res = await authed(adminCookie, 'GET', '/api/v1/wallet');
  return Number(res.json().data.wallet.balanceInr);
}

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
  adminCookie = await login('admin@excessindia.com', 'ExcessAdmin2024!');
  employeeCookie = await login('employee@excessindia.com', 'ExcessEmp2024!');
});

afterAll(async () => {
  await app.close();
});

describe('Wallet — money invariants (integration)', () => {
  it('admin can authenticate (test prerequisite)', () => {
    expect(adminCookie).toContain('excess_session=');
  });

  it('CREDIT increases the balance by exactly the amount', async () => {
    const before = await walletBalance();
    const res = await authed(adminCookie, 'POST', '/api/v1/wallet/transactions', {
      type: 'CREDIT', amountInr: 5000, description: 'test credit',
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(await walletBalance()).toBeCloseTo(before + 5000, 2);
  });

  it('a DEBIT beyond the balance is REJECTED (422) and leaves the balance UNCHANGED (no overdraft)', async () => {
    const before = await walletBalance();
    const res = await authed(adminCookie, 'POST', '/api/v1/wallet/transactions', {
      type: 'DEBIT', amountInr: before + 1_000_000, description: 'overdraft attempt',
    });
    expect(res.statusCode).toBe(422);
    expect(await walletBalance()).toBe(before); // unchanged — overdraft prevented
  });

  it('a valid DEBIT decreases the balance by exactly the amount', async () => {
    await authed(adminCookie, 'POST', '/api/v1/wallet/transactions', { type: 'CREDIT', amountInr: 2000, description: 'seed' });
    const before = await walletBalance();
    const res = await authed(adminCookie, 'POST', '/api/v1/wallet/transactions', {
      type: 'DEBIT', amountInr: 800, description: 'valid debit',
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(await walletBalance()).toBeCloseTo(before - 800, 2);
  });

  it('balance is never negative', async () => {
    expect(await walletBalance()).toBeGreaterThanOrEqual(0);
  });

  it('LEDGER INVARIANT: balance === Σ(CREDIT) − Σ(DEBIT) across all transactions', async () => {
    const { balance, ledger } = await withSystemContext(prisma, HQ, async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { tenantId: HQ } });
      const txns = await tx.walletTransaction.findMany({ where: { walletId: wallet!.id }, select: { type: true, amountInr: true } });
      const ledger = txns.reduce((s, t) => s + (t.type === 'CREDIT' ? Number(t.amountInr) : -Number(t.amountInr)), 0);
      return { balance: Number(wallet!.balanceInr), ledger };
    });
    expect(balance).toBeCloseTo(ledger, 2);
  });

  it('a non-admin (employee) cannot write to the wallet (403)', async () => {
    const res = await authed(employeeCookie, 'POST', '/api/v1/wallet/transactions', {
      type: 'CREDIT', amountInr: 1, description: 'should be forbidden',
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('Payout — double-payout + state invariants (integration)', () => {
  let commissionIds: string[] = [];

  beforeAll(async () => {
    const lead = await withSystemContext(prisma, HQ, (tx) => tx.lead.findFirst({ where: { tenantId: HQ }, select: { id: true } }));
    if (!lead) return;
    const created = await withSystemContext(prisma, HQ, async (tx) => {
      const ids: string[] = [];
      for (let i = 0; i < 2; i++) {
        const c = await tx.commission.create({
          data: {
            tenantId: HQ, leadId: lead.id, dealValueInr: 300000, ratePercent: 2.5,
            commissionInr: 7500, gstInr: 1350, netPayableInr: 8850, status: 'APPROVED',
          },
          select: { id: true },
        });
        ids.push(c.id);
      }
      return ids;
    });
    commissionIds = created;
  });

  afterAll(async () => {
    await withSystemContext(prisma, HQ, (tx) => tx.commission.deleteMany({ where: { id: { in: commissionIds } } }));
  });

  it('pays only APPROVED commissions, marks them PAID with a payoutId, amount = Σ netPayable', async () => {
    if (commissionIds.length === 0) return; // no lead seeded — skip
    const res = await authed(adminCookie, 'POST', '/api/v1/payouts', { commissionIds, bankUtr: 'UTR-TEST-1' });
    expect(res.statusCode).toBe(201);
    expect(Number(res.json().data.amountInr)).toBeCloseTo(8850 * 2, 2);

    const after = await withSystemContext(prisma, HQ, (tx) =>
      tx.commission.findMany({ where: { id: { in: commissionIds } }, select: { status: true, payoutId: true } }),
    );
    expect(after.every((c) => c.status === 'PAID' && c.payoutId)).toBe(true);
  });

  it('DOUBLE-PAYOUT PREVENTED: paying the same commissions again is rejected (400 no_approved)', async () => {
    if (commissionIds.length === 0) return;
    const res = await authed(adminCookie, 'POST', '/api/v1/payouts', { commissionIds, bankUtr: 'UTR-TEST-2' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('payout.no_approved_commissions');

    // still paid exactly once — same single payoutId, no second transition
    const after = await withSystemContext(prisma, HQ, (tx) =>
      tx.commission.findMany({ where: { id: { in: commissionIds } }, select: { payoutId: true } }),
    );
    expect(new Set(after.map((c) => c.payoutId)).size).toBe(1);
  });

  it('a non-admin (employee) cannot create a payout (403)', async () => {
    const res = await authed(employeeCookie, 'POST', '/api/v1/payouts', { commissionIds: [HQ] });
    expect(res.statusCode).toBe(403);
  });
});
