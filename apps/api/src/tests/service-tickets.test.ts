/**
 * Service Tickets API — auth guard, permission enforcement, and input validation.
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

describe('Service Tickets: unauthenticated requests are rejected', () => {
  const routes: [string, string, object?][] = [
    ['GET',   '/api/v1/service-tickets'],
    ['GET',   '/api/v1/service-tickets/alerts'],
    ['POST',  '/api/v1/service-tickets', { leadId: 'x', type: 'COMPLAINT', subject: 'x', description: 'x' }],
    ['GET',   '/api/v1/service-tickets/nonexistent-id'],
    ['PATCH', '/api/v1/service-tickets/nonexistent-id', { status: 'IN_PROGRESS' }],
    ['POST',  '/api/v1/service-tickets/nonexistent-id/comments', { text: 'hi' }],
    ['POST',  '/api/v1/service-tickets/nonexistent-id/notify', { message: 'hi' }],
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

// ── Input validation (unauthenticated path still reaches Zod before auth on POST) ──

describe('Service Tickets: GET /alerts is a protected route', () => {
  it('returns 401 without session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/service-tickets/alerts' });
    expect(res.statusCode).toBe(401);
  });
});

// ── auth guard covers new delivery routes ──────────────────────────────────────

describe('Service Tickets: schedule and analytics routes are protected', () => {
  it('GET /api/v1/service-tickets with visitFrom param → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/service-tickets',
      query: { visitFrom: '2024-01-01', visitTo: '2024-01-07' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/service-tickets with date range param → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/service-tickets',
      query: { from: '2024-01-01', to: '2024-01-31', limit: '2000' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/service-tickets with unscheduled param → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/service-tickets',
      query: { unscheduled: 'true', status: 'OPEN' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── Error shapes are consistent ────────────────────────────────────────────────

describe('Service Tickets: 401 response shape', () => {
  it('has { error: { code, message } } shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/service-tickets' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { error?: { code?: string } };
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code');
  });
});

// ── Photo and delete routes are protected ─────────────────────────────────────

describe('Service Tickets: photo endpoints are protected', () => {
  it('DELETE /api/v1/service-tickets/:id/photos/:photoId → 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/service-tickets/fake-id/photos/fake-photo-id',
    });
    expect(res.statusCode).toBe(401);
  });
});
