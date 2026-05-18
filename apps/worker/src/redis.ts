import IORedis from 'ioredis';
import pino from 'pino';
import { env } from '@excess/config';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('error', (err) => {
  log.error({ err }, 'Redis connection error');
});
