import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@excess/db';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', { config: { public: true } }, async (_req, reply) => {
    const checks: Record<string, 'ok' | 'error'> = {};

    // DB ping
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks['database'] = 'ok';
    } catch {
      checks['database'] = 'error';
    }

    // Redis ping
    try {
      await app.redis.ping();
      checks['redis'] = 'ok';
    } catch {
      checks['redis'] = 'error';
    }

    // Queue health — verify the lead-ingest queue is reachable
    try {
      await app.queues.leadIngest.getJobCounts('waiting', 'active', 'failed');
      checks['queues'] = 'ok';
    } catch {
      checks['queues'] = 'error';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');
    const statusCode = allOk ? 200 : 503;

    return reply.code(statusCode).send({
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  // Readiness probe — lightweight check, no external deps
  app.get('/ready', { config: { public: true } }, async (_req, reply) => {
    return reply.send({ ready: true });
  });
};
