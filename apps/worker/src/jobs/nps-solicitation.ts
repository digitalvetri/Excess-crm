import pino from 'pino';
import { prisma, withSystemContext } from '@excess/db';
import { queues } from '../queues.js';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const NPS_DELAY_DAYS = 7; // ask for NPS 7 days after commissioning

export async function runNpsSolicitation(): Promise<void> {
  const cutoff = new Date(Date.now() - NPS_DELAY_DAYS * 24 * 3600 * 1000);

  const projects = await prisma.project.findMany({
    where: { commissionedAt: { not: null, lte: cutoff } },
    select: { id: true, tenantId: true, leadId: true },
    take: 500,
  });
  if (projects.length === 0) return;

  let requested = 0;
  for (const project of projects) {
    // Dedup — an NPS review already created for this lead means we've asked
    const existing = await withSystemContext(prisma, project.tenantId, (tx) =>
      tx.review.findFirst({
        where: { leadId: project.leadId, npsRequestedAt: { not: null } },
        select: { id: true },
      }),
    );
    if (existing) continue;

    const lead = await withSystemContext(prisma, project.tenantId, (tx) =>
      tx.lead.findUnique({
        where: { id: project.leadId },
        select: { name: true, phone: true, commsOptedOutAt: true },
      }),
    );
    if (!lead || lead.commsOptedOutAt) continue;

    // Mark requested first so a later crash never double-asks
    await withSystemContext(prisma, project.tenantId, (tx) =>
      tx.review.create({
        data: {
          tenantId: project.tenantId,
          leadId: project.leadId,
          source: 'NPS',
          npsRequestedAt: new Date(),
        },
      }),
    );

    // Flag the WhatsApp session so the inbound reply can be matched back
    await withSystemContext(prisma, project.tenantId, (tx) =>
      tx.waSession.upsert({
        where: { tenantId_phone: { tenantId: project.tenantId, phone: lead.phone } },
        update: { npsPendingProjectId: project.id },
        create: {
          tenantId: project.tenantId,
          leadId: project.leadId,
          phone: lead.phone,
          npsPendingProjectId: project.id,
          lastMessageAt: new Date(),
          sessionExpiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        },
      }),
    );

    await queues.whatsappSend.add('whatsapp-send', {
      tenantId: project.tenantId,
      leadId: project.leadId,
      phone: lead.phone,
      template: 'REVIEW_REQUEST',
      vars: { customerName: lead.name },
    });

    requested++;
    log.info({ tenantId: project.tenantId, projectId: project.id }, 'nps.requested');
  }

  log.info({ projectCount: projects.length, requested }, 'nps_solicitation.complete');
}

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

export function startNpsSolicitationScheduler(): void {
  const run = () => {
    void runNpsSolicitation().catch((err: unknown) => log.error({ err }, 'nps_solicitation.run_error'));
  };

  setTimeout(run, 6 * 60 * 1000); // 6-min startup offset
  setInterval(run, CHECK_INTERVAL_MS);

  log.info({ intervalMs: CHECK_INTERVAL_MS }, 'nps_solicitation_scheduler.started');
}
