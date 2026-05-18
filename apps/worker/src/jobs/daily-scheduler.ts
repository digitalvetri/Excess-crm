import pino from 'pino';
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

export function startDailyScheduler(): void {
  const scheduleNext = () => {
    const delay = msUntilMidnightIST();
    log.info({ nextRunMs: delay }, 'daily_scheduler.scheduled');
    setTimeout(() => {
      void runDailyCompliance()
        .then(() => log.info('daily_scheduler.compliance_complete'))
        .catch((err: unknown) => log.error({ err }, 'daily_scheduler.compliance_error'));
      scheduleNext(); // re-schedule for next day
    }, delay);
  };
  scheduleNext();
}
