/**
 * Commission slab validation (report 5.3) — a malformed slab must be rejected on write,
 * not silently persisted (computeCommission would then fall back to the 5% default).
 * Requires docker-compose up + a seeded DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';

let app: FastifyInstance;
let adminCookie = '';

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'admin@excessindia.com', password: 'ExcessAdmin2024!' } });
  const c = res.cookies.find((x) => x.name === 'excess_session');
  adminCookie = c ? `excess_session=${c.value}` : '';
});

afterAll(async () => {
  await app.close();
});

describe('Franchise — commission slab validation', () => {
  // Validation runs (safeParse) before any side effect, so a 400 means nothing was created.
  function post(commissionSlabs: unknown) {
    return app.inject({ method: 'POST', url: '/api/v1/franchise', headers: { cookie: adminCookie }, payload: { name: 'Slab Test', commissionSlabs } });
  }

  it('rejects a slab with a non-numeric value (400 validation_error)', async () => {
    const res = await post({ '0': 'high' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
  });

  it('rejects a slab with an invalid (non-threshold) key', async () => {
    expect((await post({ 'not-a-threshold': 5 })).statusCode).toBe(400);
  });

  it('rejects a negative slab value', async () => {
    expect((await post({ '0': -5 })).statusCode).toBe(400);
  });
});
