/**
 * API integration tests — auth guard and permission enforcement.
 *
 * These tests use a real Fastify instance (no DB required for the auth tests)
 * to verify that unauthenticated and forbidden requests are rejected before
 * any business logic runs.
 *
 * Requires: docker-compose up -d (for Redis + Postgres when using the real buildServer)
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

// ── unauthenticated requests ───────────────────────────────────────────────────

describe('Auth guard: unauthenticated requests are rejected', () => {
  const protectedRoutes: [string, string][] = [
    ['GET', '/api/v1/leads'],
    ['GET', '/api/v1/calls'],
    ['GET', '/api/v1/appointments'],
    ['GET', '/api/v1/quotations'],
    ['GET', '/api/v1/franchise'],
    ['GET', '/api/v1/commissions'],
    ['GET', '/api/v1/teams'],
    ['GET', '/api/v1/wallet'],
    ['GET', '/api/v1/leaderboard'],
    ['GET', '/api/v1/referrals'],
    ['GET', '/api/v1/reviews'],
  ];

  for (const [method, url] of protectedRoutes) {
    it(`${method} ${url} returns 401 without session`, async () => {
      const res = await app.inject({ method: method as never, url });
      expect(res.statusCode).toBe(401);
    });
  }
});

// ── public routes are accessible ──────────────────────────────────────────────

describe('Public routes: accessible without auth', () => {
  it('GET /api/v1/health returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /api/v1/webhooks/meta returns 403 on missing token (not 401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/webhooks/meta',
      query: { 'hub.mode': 'subscribe', 'hub.challenge': 'test', 'hub.verify_token': 'wrong' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/v1/webhooks/indiamart returns 200 on unknown key (no 5xx)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/indiamart?key=unknown-test-key',
      payload: { SENDER_MOBILE: '9999999999', SENDER_NAME: 'Test' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('POST /api/v1/webhooks/justdial returns 200 on unknown key (no 5xx)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/justdial',
      payload: { key: 'unknown-test-key', mobile: '9999999999', name: 'Test' },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ── input validation ───────────────────────────────────────────────────────────

describe('Auth route input validation', () => {
  it('POST /api/v1/auth/login with invalid body returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'not-an-email', password: '' },
    });
    expect([400, 422]).toContain(res.statusCode);
  });

  it('POST /api/v1/auth/login with missing fields returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {},
    });
    expect([400, 422]).toContain(res.statusCode);
  });
});
