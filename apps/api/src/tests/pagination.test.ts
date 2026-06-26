/**
 * Keyset pagination — list routes must page deterministically (total order on the sort
 * field + id tiebreaker), so no row is dropped or duplicated across pages. Requires
 * docker-compose up + a seeded DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { prisma, withSystemContext } from '@excess/db';

let app: FastifyInstance;
let adminCookie = '';
const TOKEN = `PGT${Date.now()}`;            // unique marker so the leads search isolates our rows
const HQ = 'aaaaaaaa-0000-0000-0000-000000000001';
const TENANT_ID = '00000000-0000-0000-0000-0000000000a1';

async function login(): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'admin@excessindia.com', password: 'ExcessAdmin2024!' } });
  const c = res.cookies.find((x) => x.name === 'excess_session');
  return c ? `excess_session=${c.value}` : '';
}

/** Follow nextCursor to the end, collecting every row. */
async function paginateAll(baseUrl: string, key: string): Promise<{ id: string }[]> {
  const all: { id: string }[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 25; guard++) {
    const url: string = baseUrl + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const res = await app.inject({ method: 'GET', url, headers: { cookie: adminCookie } });
    const data = res.json().data as { hasMore: boolean; nextCursor: string | null; [k: string]: unknown };
    all.push(...((data[key] as { id: string }[] | undefined) ?? []));
    if (!data.hasMore) break;
    cursor = data.nextCursor;
    expect(cursor, 'hasMore=true must return a nextCursor').toBeTruthy();
  }
  return all;
}

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
  adminCookie = await login();

  await withSystemContext(prisma, TENANT_ID, async (tx) => {
    await tx.tenant.upsert({
      where: { id: TENANT_ID },
      update: {},
      create: { id: TENANT_ID, name: `PgTest ${TOKEN}`, type: 'FRANCHISE', status: 'ACTIVE', tier: 'SILVER', territory: {}, commissionSlabs: [] },
    });
    // anchor lead in the test tenant — gives the commissions a valid leadId FK
    const lead = await tx.lead.create({ data: { tenantId: TENANT_ID, name: `${TOKEN} anchor`, phone: `90000000000`, phoneRaw: `90000000000`, sourceType: 'MANUAL' }, select: { id: true } });

    // 50 commissions for the test tenant (isolated via the franchiseId filter)
    for (let i = 0; i < 50; i++) {
      await tx.commission.create({
        data: { tenantId: TENANT_ID, leadId: lead.id, dealValueInr: 300000, ratePercent: 2.5, commissionInr: 7500, gstInr: 1350, netPayableInr: 8850, status: 'PENDING_APPROVAL' },
      });
    }
  });

  // 50 leads in HQ (the admin's tenant, so /leads sees them), sharing the search token.
  // Many will share the same createdAt → exercises the id tiebreaker.
  await withSystemContext(prisma, HQ, async (tx) => {
    for (let i = 0; i < 50; i++) {
      const phone = `92${String(i).padStart(9, '0')}`;
      await tx.lead.create({ data: { tenantId: HQ, name: `${TOKEN} lead ${i}`, phone, phoneRaw: phone, sourceType: 'MANUAL' } });
    }
  });
});

afterAll(async () => {
  await withSystemContext(prisma, TENANT_ID, async (tx) => {
    await tx.commission.deleteMany({ where: { tenantId: TENANT_ID } });
    await tx.lead.deleteMany({ where: { name: { startsWith: TOKEN } } }); // HQ + test-tenant test leads
    await tx.tenant.deleteMany({ where: { id: TENANT_ID } });
  });
  await app.close();
});

describe('Keyset pagination — leads (dynamic sort, search + keyset compose)', () => {
  it('returns all 50 rows across pages, no duplicates, in a stable order', async () => {
    const ids = (await paginateAll(`/api/v1/leads?search=${TOKEN}&limit=20`, 'leads')).map((l) => l.id);
    expect(ids.length, 'total rows across all pages').toBe(50);
    expect(new Set(ids).size, 'no id appears twice').toBe(50);

    const idsAgain = (await paginateAll(`/api/v1/leads?search=${TOKEN}&limit=20`, 'leads')).map((l) => l.id);
    expect(idsAgain, 'order is stable across identical requests').toEqual(ids);
  });
});

describe('Keyset pagination — commissions (createdAt + id)', () => {
  it('returns all 50 rows across pages, no duplicates, in a stable order', async () => {
    const ids = (await paginateAll(`/api/v1/commissions?franchiseId=${TENANT_ID}&limit=20`, 'commissions')).map((c) => c.id);
    expect(ids.length, 'total rows across all pages').toBe(50);
    expect(new Set(ids).size, 'no id appears twice').toBe(50);

    const idsAgain = (await paginateAll(`/api/v1/commissions?franchiseId=${TENANT_ID}&limit=20`, 'commissions')).map((c) => c.id);
    expect(idsAgain, 'order is stable').toEqual(ids);
  });
});
