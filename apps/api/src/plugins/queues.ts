import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { env } from '@excess/config';

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

function mkQueue(name: string) {
  return new Queue(name, { connection: redis, defaultJobOptions });
}

export const appQueues = {
  leadIngest: mkQueue('lead-ingest'),
  voiceDial: mkQueue('voice-dial'),
  callWebhook: mkQueue('call-webhook'),
  whatsappSend: mkQueue('whatsapp-send'),
  emailSend: mkQueue('email-send'),
  humanHandoff: mkQueue('human-handoff'),
  commissionCalc: mkQueue('commission-calc'),
  pdfRender: mkQueue('pdf-render'),
  csvImport: mkQueue('csv-import'),
};

declare module 'fastify' {
  interface FastifyInstance {
    queues: typeof appQueues;
  }
}

const queuesPluginImpl: FastifyPluginAsync = async (app) => {
  app.decorate('queues', appQueues);

  app.addHook('onClose', async () => {
    await Promise.all(Object.values(appQueues).map((q) => q.close()));
    void redis.quit();
  });
};

export const queuesPlugin = fp(queuesPluginImpl, { name: 'queues' });
