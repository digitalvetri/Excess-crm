import pino from 'pino';
import { prisma, withSystemContext, SYSTEM_TENANT_ID } from '@excess/db';
import { queues } from '../queues.js';
import { runDailyCompliance } from './data-retention.js';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

function msUntilMidnightIST(): number {
  const now = new Date();
  // IST = UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(now.getTime() + istOffset);
  const midnightIST = new Date(nowIST);
  midnightIST.setUTCHours(0, 0, 0, 0);
  // next midnight
  const nextMidnight = new Date(midnightIST.getTime() + 24 * 60 * 60 * 1000);
  return nextMidnight.getTime() - now.getTime();
}

/**
 * Returns the IST day-of-week (0=Sunday … 6=Saturday) for the current moment.
 */
function istDayOfWeek(): number {
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + istOffset).getUTCDay();
}

export function startDailyScheduler(): void {
  const scheduleNext = () => {
    const delay = msUntilMidnightIST();
    log.info({ nextRunMs: delay }, 'daily_scheduler.scheduled');

    setTimeout(() => {
      const dayOfWeek = istDayOfWeek();

      // Daily: DPDP data retention + DND leak audit
      void runDailyCompliance()
        .then(() => log.info('daily_scheduler.compliance_complete'))
        .catch((err: unknown) => log.error({ err }, 'daily_scheduler.compliance_error'));

      // Weekly on Sunday (IST): scrub all active lead phones against TRAI DND registry.
      // Runs at midnight Sunday so the fresh list is ready before Monday's business hours.
      if (dayOfWeek === 0) {
        void queues.dndScrub
          .add('dnd-scrub', { mode: 'weekly-lead-scrub' }, { attempts: 2, backoff: { type: 'fixed', delay: 10 * 60 * 1000 } })
          .then(() => log.info('daily_scheduler.dnd_scrub_enqueued'))
          .catch((err: unknown) => log.error({ err }, 'daily_scheduler.dnd_scrub_enqueue_error'));
      }

      scheduleNext(); // re-schedule for next day
    }, delay);
  };

  scheduleNext();
}

const INDIAMART_PULL_INTERVAL_MS = (parseInt(process.env['INDIAMART_PULL_FALLBACK_INTERVAL_MIN'] ?? '5', 10)) * 60 * 1000;

/** Polls all active IndiaMART sources every INDIAMART_PULL_FALLBACK_INTERVAL_MIN minutes. */
export function startIndiamartPullScheduler(): void {
  const run = async () => {
    try {
      const sources = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
        tx.leadSource.findMany({
          where: { type: 'INDIAMART', isActive: true },
          select: { id: true, tenantId: true },
        }),
      );
      for (const src of sources) {
        await queues.indiamartPull.add(
          'indiamart-pull',
          { sourceId: src.id, tenantId: src.tenantId },
          { attempts: 2, backoff: { type: 'fixed', delay: 60_000 } },
        );
      }
      if (sources.length > 0) {
        log.info({ count: sources.length }, 'indiamart_pull_scheduler.enqueued');
      }
    } catch (err) {
      log.error({ err }, 'indiamart_pull_scheduler.error');
    }
  };

  void run(); // run immediately on start
  setInterval(() => { void run(); }, INDIAMART_PULL_INTERVAL_MS);
}
