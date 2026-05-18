import IORedis from 'ioredis';
import pino from 'pino';
import { queues } from '../queues.js';
import { env } from '@excess/config';

interface FollowUpMessage {
  leadId: string;
  tenantId: string;
  personaId: string;
  delayMs: number;
}

export function startFollowUpScheduler(): void {
  const subscriber = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

  const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

  subscriber.subscribe('schedule:followup', (err) => {
    if (err) {
      log.error({ err }, 'followup_scheduler.subscribe_failed');
    }
  });

  subscriber.on('message', (_channel: string, message: string) => {
    void (async () => {
      try {
        const { leadId, tenantId, personaId, delayMs } = JSON.parse(message) as FollowUpMessage;
        await queues.voiceDial.add(
          'voice-dial',
          { leadId, tenantId, personaId },
          { delay: delayMs, priority: 2 },
        );
      } catch (err: unknown) {
        log.warn({ err }, 'followup_scheduler.enqueue_failed');
      }
    })();
  });
}
