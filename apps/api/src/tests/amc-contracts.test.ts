/**
 * AMC Contracts API — auth guard, permission enforcement, and input validation.
 * Requires: docker-compose up -d
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// ── Unauthenticated requests ──────────────────────────────────────────────────

describe('AMC Contracts: unauthenticated requests are rejected', () => {
  const routes: [string, string, object?][] = [
    ['GET',   '/api/v1/amc-contracts'],
    ['POST',  '/api/v1/amc-contracts', { projectId: '00000000-0000-0000-0000-000000000001', planYears: 1, startDate: '2025-01-01' }],
    ['GET',   '/api/v1/amc-contracts/nonexistent-id'],
    ['PATCH', '/api/v1/amc-contracts/nonexistent-id', { status: 'CANCELLED' }],
    ['POST',  '/api/v1/amc-contracts/nonexistent-id/renew', { planYears: 1 }],
  ];

  for (const [method, url, payload] of routes) {
    it(`${method} ${url} → 401 without session`, async () => {
      const res = await app.inject({
        method: method as never,
        url,
        ...(payload && { payload }),
      });
      expect(res.statusCode).toBe(401);
    });
  }
});

// ── Query filters are still protected ────────────────────────────────────────

describe('AMC Contracts: query param variants are still protected', () => {
  it('GET with window=expiring30 → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/amc-contracts',
      query: { window: 'expiring30' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET with window=expired → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/amc-contracts',
      query: { window: 'expired' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET with projectId filter → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/amc-contracts',
      query: { projectId: '00000000-0000-0000-0000-000000000001' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── Error shape is consistent ─────────────────────────────────────────────────

describe('AMC Contracts: 401 response shape', () => {
  it('has { error: { code, message } } shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/amc-contracts' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { error?: { code?: string; message?: string } };
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code');
    expect(body.error).toHaveProperty('message');
  });
});

// ── Renew conflict check is protected ────────────────────────────────────────

describe('AMC Contracts: renewal endpoint is protected', () => {
  it('POST /:id/renew with already-renewed contract ID → 401 (not 409)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/amc-contracts/some-already-renewed-id/renew',
      payload: { planYears: 2 },
    });
    // Auth runs before business logic — must be 401, not 409
    expect(res.statusCode).toBe(401);
  });
});
