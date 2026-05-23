import pino from 'pino';
import { prisma, withSystemContext, SYSTEM_USER_ID } from '@excess/db';
import { redis } from '../redis.js';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const DORMANT_DAYS = 60; // leads with no stage change in this many days

export async function runReengagementScheduler(): Promise<void> {
  const now = new Date();
  const dormantThreshold = new Date(now.getTime() - DORMANT_DAYS * 86400000);
  const todayKey = now.toISOString().slice(0, 10);

  // Find tenants that have dormant leads
  const dormantLeads = await prisma.lead.findMany({
    where: {
      stage:          { in: ['NOT_ANSWERED', 'FOLLOW_UP'] },
      stageChangedAt: { lte: dormantThreshold },
      isDuplicate:    false,
      commsOptedOutAt: null,
    },
    select:   { tenantId: true },
    distinct: ['tenantId'],
    take:     50,
  });

  if (dormantLeads.length === 0) return;

  for (const { tenantId } of dormantLeads) {
    const dedupKey = `reengagement:draft:${tenantId}:${todayKey}`;
    if (await redis.exists(dedupKey)) continue;
    await redis.setex(dedupKey, 2 * 86400, '1');

    // Count dormant leads for this tenant to include in broadcast name
    const count = await prisma.lead.count({
      where: {
        tenantId,
        stage:          { in: ['NOT_ANSWERED', 'FOLLOW_UP'] },
        stageChangedAt: { lte: dormantThreshold },
        isDuplicate:    false,
        commsOptedOutAt: null,
      },
    });

    await withSystemContext(prisma, tenantId, (tx) =>
      tx.broadcast.create({
        data: {
          tenantId,
          name:            `Re-engagement — ${count} dormant leads — ${todayKey}`,
          channel:         'WHATSAPP',
          templateName:    'reengagement_outreach',
          audienceFilter:  { stage: 'NOT_ANSWERED' },
          createdByUserId: SYSTEM_USER_ID,
        },
      }),
    );

    log.info({ tenantId, count, date: todayKey }, 'reengagement.draft_created');
  }

  log.info({ tenants: dormantLeads.length }, 'reengagement_scheduler.complete');
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

export function startReengagementScheduler(): void {
  const run = () => {
    void runReengagementScheduler().catch((err: unknown) =>
      log.error({ err }, 'reengagement_scheduler.run_error'),
    );
  };

  // 12-min startup offset
  setTimeout(run, 12 * 60 * 1000);
  setInterval(run, CHECK_INTERVAL_MS);

  log.info({ intervalMs: CHECK_INTERVAL_MS }, 'reengagement_scheduler.started');
}
