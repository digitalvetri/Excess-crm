/**
 * The voice-agent config-write endpoint must reject prompts that break live calls
 * (romanized Tamil / spoken function names) — the guard that prevents the hand-edited
 * romanized prompt that broke production. Requires docker-compose up + a seeded DB.
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

describe('Voice prompt lint guard (POST /voice-agent/configs)', () => {
  function save(systemPrompt: string) {
    return app.inject({ method: 'POST', url: '/api/v1/voice-agent/configs', headers: { cookie: adminCookie }, payload: { personaId: 'EXCESS_AGENT', systemPrompt } });
  }

  it('rejects a romanized-Tamil prompt (400 prompt_lint_failed) — does not create it', async () => {
    const res = await save('Vanakkam! Naan Excess Renew Solar-ilirundhu Reshma pesugiren. Call updateLeadStage with stage QUALIFIED.');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('voice_agent.prompt_lint_failed');
    expect(res.json().error.details.issues.length).toBeGreaterThan(0);
  });
});
