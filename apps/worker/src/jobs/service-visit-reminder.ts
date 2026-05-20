import pino from 'pino';
import { prisma, withSystemContext } from '@excess/db';
import { redis } from '../redis.js';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const REMINDER_DEDUP_TTL_SEC = 3 * 24 * 3600; // 3 days — one reminder per scheduled visit

export async function runServiceVisitReminders(): Promise<void> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 3600 * 1000);

  // Tickets with a scheduled visit in the next 24h that are still actionable
  const tickets = await prisma.serviceTicket.findMany({
    where: {
      scheduledVisitAt: { gte: now, lte: horizon },
      status: { in: ['OPEN', 'IN_PROGRESS'] },
    },
    select: {
      id: true,
      tenantId: true,
      leadId: true,
      type: true,
      subject: true,
      scheduledVisitAt: true,
    },
    take: 500,
  });

  if (tickets.length === 0) return;

  for (const ticket of tickets) {
    const dedupKey = `svc:reminded:${ticket.id}`;
    if (await redis.exists(dedupKey)) continue;
    await redis.setex(dedupKey, REMINDER_DEDUP_TTL_SEC, '1');

    const visitDate = ticket.scheduledVisitAt
      ? new Date(ticket.scheduledVisitAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      : 'soon';

    await withSystemContext(prisma, ticket.tenantId, (tx) =>
      tx.leadActivity.create({
        data: {
          leadId: ticket.leadId,
          tenantId: ticket.tenantId,
          actorIsAi: true,
          type: 'NOTE',
          payload: {
            note: `🔧 Service visit reminder: "${ticket.subject}" (${ticket.type.replace(/_/g, ' ')}) is scheduled for ${visitDate}`,
            serviceTicketId: ticket.id,
            reminderType: 'SERVICE_VISIT',
          } as object,
        },
      }),
    );

    log.info({ tenantId: ticket.tenantId, ticketId: ticket.id }, 'service_visit.reminded');
  }

  log.info({ ticketCount: tickets.length }, 'service_visit_reminders.complete');
}

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

export function startServiceVisitReminderScheduler(): void {
  const run = () => {
    void runServiceVisitReminders().catch((err: unknown) =>
      log.error({ err }, 'service_visit_reminders.run_error'),
    );
  };

  setTimeout(run, 4 * 60 * 1000); // 4-min startup offset
  setInterval(run, CHECK_INTERVAL_MS);

  log.info({ intervalMs: CHECK_INTERVAL_MS }, 'service_visit_reminder_scheduler.started');
}
