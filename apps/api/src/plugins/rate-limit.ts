import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

const rateLimitPluginImpl: FastifyPluginAsync = async (app) => {
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: '1 minute',
    redis: app.redis,
    keyGenerator: (req) => {
      // req.auth may not be set yet (plugin runs before authPlugin's preHandler)
      const auth = (req.auth as { userId?: string; tenantId?: string } | undefined);
      if (auth?.userId) {
        return `rl:user:${auth.tenantId}:${auth.userId}`;
      }
      return `rl:ip:${req.ip}`;
    },
    errorResponseBuilder: (_req, context) => ({
      error: {
        code: 'rate_limit_exceeded',
        message: `Too many requests. Retry after ${String(context.after)}.`,
      },
    }),
  });
};

export const rateLimitPlugin = fp(rateLimitPluginImpl, {
  name: 'rate-limit',
  dependencies: ['redis'],
});
