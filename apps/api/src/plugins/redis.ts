import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { Redis } from 'ioredis';
import { env } from '@excess/config';

const redisClient = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  lazyConnect: true,
});

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

const redisPluginImpl: FastifyPluginAsync = async (app) => {
  await redisClient.connect();
  app.decorate('redis', redisClient);
  app.addHook('onClose', async () => { void redisClient.quit(); });
};

export const redisPlugin = fp(redisPluginImpl, { name: 'redis' });
