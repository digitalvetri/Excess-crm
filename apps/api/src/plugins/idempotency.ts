import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

const IDEMPOTENCY_TTL_SECONDS = 86_400;

declare module 'fastify' {
  interface FastifyRequest {
    _idempotencyRedisKey?: string;
  }
}

interface CachedResponse {
  statusCode: number;
  body: string;
}

const idempotencyPluginImpl: FastifyPluginAsync = async (app) => {
  // preHandler runs after authPlugin's preHandler sets req.auth
  app.addHook('preHandler', async (req, reply) => {
    if (req.method !== 'POST') return;

    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey || typeof idempotencyKey !== 'string') return;

    // req.auth is set by authPlugin — only apply to authenticated requests
    if (!req.auth?.tenantId) return;

    const redisKey = `idempotent:${req.auth.tenantId}:${idempotencyKey}`;

    const cached = await app.redis.get(redisKey);
    if (cached !== null) {
      let parsed: CachedResponse;
      try {
        parsed = JSON.parse(cached) as CachedResponse;
      } catch {
        app.log.warn(
          { tenantId: req.auth.tenantId, redisKey },
          'idempotency: failed to parse cached response — skipping replay',
        );
        return;
      }
      void reply.header('idempotent-replay', 'true');
      return reply.code(parsed.statusCode).send(JSON.parse(parsed.body) as unknown);
    }

    // Stash the key so onSend can cache the response
    req._idempotencyRedisKey = redisKey;
  });

  app.addHook('onSend', async (req, reply, payload) => {
    const redisKey = req._idempotencyRedisKey;
    if (!redisKey) return payload;

    // Only cache successful responses — do not replay errors forever
    if (reply.statusCode >= 400) return payload;

    // payload may be string | Buffer | null — only cache string payloads
    if (typeof payload !== 'string') return payload;

    const entry: CachedResponse = {
      statusCode: reply.statusCode,
      body: payload,
    };

    try {
      await app.redis.set(redisKey, JSON.stringify(entry), 'EX', IDEMPOTENCY_TTL_SECONDS);
    } catch (err) {
      app.log.warn(
        { tenantId: req.auth?.tenantId, redisKey, err },
        'idempotency: failed to cache response — continuing without caching',
      );
    }

    return payload;
  });
};

export const idempotencyPlugin = fp(idempotencyPluginImpl, {
  name: 'idempotency',
  dependencies: ['redis'],
});
