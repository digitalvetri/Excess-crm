import pino from 'pino';
import { prisma, withSystemContext } from '@excess/db';
import type { LeadSourceType, LeadStage } from '@excess/db';
import { queues } from '../queues.js';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const PER_SECOND = Math.max(1, Number(process.env['BROADCAST_PER_SECOND'] ?? 10));
const MAX_RECIPIENTS = 5000;

export async function runBroadcastScheduler(): Promise<void> {
  const now = new Date();

  // Find SCHEDULED broadcasts whose scheduledAt has passed
  const due = await prisma.broadcast.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
    select: { id: true, tenantId: true, audienceFilter: true, templateName: true, templateParams: true, bodyText: true, channel: true },
    take: 20,
  });

  if (due.length === 0) return;

  for (const broadcast of due) {
    try {
      const where = buildLeadWhere(broadcast.tenantId, broadcast.audienceFilter as AudienceFilter);

      const leads = await withSystemContext(prisma, broadcast.tenantId, (tx) =>
        tx.lead.findMany({ where, take: MAX_RECIPIENTS, select: { id: true, phone: true } }),
      );

      if (leads.length === 0) {
        await withSystemContext(prisma, broadcast.tenantId, (tx) =>
          tx.broadcast.update({ where: { id: broadcast.id }, data: { status: 'FAILED' } }),
        );
        log.warn({ broadcastId: broadcast.id, tenantId: broadcast.tenantId }, 'broadcast_scheduler.empty_audience');
        continue;
      }

      const recipients = await withSystemContext(prisma, broadcast.tenantId, async (tx) => {
        await tx.broadcastRecipient.createMany({
          data: leads.map((l) => ({
            broadcastId: broadcast.id,
            tenantId:    broadcast.tenantId,
            leadId:      l.id,
            phone:       l.phone,
          })),
          skipDuplicates: true,
        });
        await tx.broadcast.update({
          where: { id: broadcast.id },
          data:  { status: 'SENDING', startedAt: new Date(), recipientCount: leads.length },
        });
        return tx.broadcastRecipient.findMany({
          where:  { broadcastId: broadcast.id },
          select: { id: true, leadId: true, phone: true },
        });
      });

      const templateParams = (broadcast.templateParams ?? {}) as Record<string, string>;
      await queues.broadcastSend.addBulk(
        recipients.map((r, idx) => ({
          name: 'broadcast-send',
          data: {
            broadcastId:    broadcast.id,
            recipientId:    r.id,
            tenantId:       broadcast.tenantId,
            leadId:         r.leadId,
            phone:          r.phone,
            channel:        broadcast.channel,
            templateName:   broadcast.templateName,
            templateParams,
            bodyText:       broadcast.bodyText,
          },
          opts: { attempts: 1, delay: Math.floor(idx / PER_SECOND) * 1000 },
        })),
      );

      log.info({ broadcastId: broadcast.id, tenantId: broadcast.tenantId, recipients: recipients.length }, 'broadcast_scheduler.started');
    } catch (err) {
      log.error({ broadcastId: broadcast.id, err }, 'broadcast_scheduler.start_error');
    }
  }
}

// Minimal type mirror of audienceFilterSchema — avoids importing the API package
interface AudienceFilter {
  stage?: string;
  sourceType?: string;
  city?: string;
  tag?: string;
  amcWindow?: 'expiring30' | 'expiring60' | 'expired';
  subsidyStatus?: string;
  projectStage?: string;
}

function buildLeadWhere(tenantId: string, filter: AudienceFilter) {
  const now  = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const in60 = new Date(now.getTime() + 60 * 86400000);

  type ProjectWhere = { amcExpiresAt?: { gte?: Date; lte?: Date; lt?: Date }; subsidyStatus?: string; stage?: string };
  const projectFilter: ProjectWhere = {};
  if (filter.amcWindow === 'expiring30') projectFilter.amcExpiresAt = { gte: now, lte: in30 };
  else if (filter.amcWindow === 'expiring60') projectFilter.amcExpiresAt = { gte: now, lte: in60 };
  else if (filter.amcWindow === 'expired') projectFilter.amcExpiresAt = { lt: now };
  if (filter.subsidyStatus) projectFilter.subsidyStatus = filter.subsidyStatus;
  if (filter.projectStage)  projectFilter.stage         = filter.projectStage;

  return {
    tenantId,
    isDuplicate:     false,
    commsOptedOutAt: null,
    ...(filter.stage      && { stage:      filter.stage as LeadStage }),
    ...(filter.sourceType && { sourceType: filter.sourceType as LeadSourceType }),
    ...(filter.city       && { city: { contains: filter.city, mode: 'insensitive' as const } }),
    ...(filter.tag        && { tags: { has: filter.tag } }),
    ...(Object.keys(projectFilter).length > 0 && { projects: { some: projectFilter } }),
  };
}

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

export function startBroadcastScheduler(): void {
  const run = () => {
    void runBroadcastScheduler().catch((err: unknown) =>
      log.error({ err }, 'broadcast_scheduler.run_error'),
    );
  };

  // 2-min startup offset to avoid collision with other schedulers
  setTimeout(run, 2 * 60 * 1000);
  setInterval(run, CHECK_INTERVAL_MS);

  log.info({ intervalMs: CHECK_INTERVAL_MS }, 'broadcast_scheduler.started');
}
