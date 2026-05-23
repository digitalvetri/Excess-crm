import pino from 'pino';
import { prisma, withSystemContext, SYSTEM_USER_ID } from '@excess/db';
import { redis } from '../redis.js';
import { queues } from '../queues.js';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const REMINDER_WINDOWS = [
  { days: 30, dedupSuffix: '30d' },
  { days: 7,  dedupSuffix: '7d'  },
];

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('91') ? digits : `91${digits}`;
}

export async function runAmcExpiryReminders(): Promise<void> {
  const now = new Date();
  let reminded = 0;

  for (const { days, dedupSuffix } of REMINDER_WINDOWS) {
    const windowEnd   = new Date(now.getTime() + days * 86400000);
    const windowStart = new Date(now.getTime() + (days - 1) * 86400000);

    // Contracts expiring in the target window, still ACTIVE
    const contracts = await prisma.amcContract.findMany({
      where: {
        status:  'ACTIVE',
        endDate: { gte: windowStart, lte: windowEnd },
      },
      select: {
        id: true, tenantId: true, endDate: true, planYears: true,
        lead:    { select: { id: true, name: true, phone: true } },
        project: { select: { number: true } },
      },
      take: 500,
    });

    for (const contract of contracts) {
      const dedupKey = `amc:reminder:${contract.id}:${dedupSuffix}`;
      if (await redis.exists(dedupKey)) continue;
      await redis.setex(dedupKey, 8 * 86400, '1'); // 8-day dedup to cover weekly window

      const daysLeft = Math.round((contract.endDate.getTime() - now.getTime()) / 86400000);
      const phone    = normalizePhone(contract.lead.phone);

      await queues.whatsappSend.add('whatsapp-send', {
        tenantId: contract.tenantId,
        leadId:   contract.lead.id,
        phone,
        template: 'DIRECT_MESSAGE',
        vars: {
          message: `Hi ${contract.lead.name}, your Annual Maintenance Contract (AMC) for project *${contract.project.number}* expires in *${daysLeft} days*. Please contact us to renew and continue uninterrupted service support.`,
        },
      });

      // Log to lead activity so the team can see the reminder was sent
      await withSystemContext(prisma, contract.tenantId, (tx) =>
        tx.leadActivity.create({
          data: {
            leadId:    contract.lead.id,
            tenantId:  contract.tenantId,
            actorIsAi: true,
            type:      'NOTE',
            payload: {
              note: `📋 AMC renewal reminder sent — contract ${contract.id} expires in ${daysLeft} days (${contract.endDate.toISOString().slice(0, 10)})`,
              amcContractId: contract.id,
              reminderType: 'AMC_EXPIRY',
            } as object,
          },
        }),
      );

      reminded++;
      log.info({ tenantId: contract.tenantId, contractId: contract.id, daysLeft }, 'amc.reminder_sent');
    }
  }

  // Create DRAFT broadcast campaigns for each tenant that had expiring contracts (30d window only)
  // — one DRAFT per tenant per day so the marketing team can review and send
  const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const tenantsWithExpiring30 = await prisma.amcContract.findMany({
    where: {
      status:  'ACTIVE',
      endDate: { gte: new Date(now.getTime() + 29 * 86400000), lte: new Date(now.getTime() + 30 * 86400000) },
    },
    select: { tenantId: true },
    distinct: ['tenantId'],
    take: 50,
  });

  for (const { tenantId } of tenantsWithExpiring30) {
    const campaignDedupKey = `amc:campaign_draft:${tenantId}:${todayKey}`;
    if (await redis.exists(campaignDedupKey)) continue;
    await redis.setex(campaignDedupKey, 2 * 86400, '1');

    await withSystemContext(prisma, tenantId, (tx) =>
      tx.broadcast.create({
        data: {
          tenantId,
          name:            `AMC Renewal Campaign — ${todayKey}`,
          channel:         'WHATSAPP',
          templateName:    'amc_renewal_reminder',
          audienceFilter:  { amcWindow: 'expiring30' },
          createdByUserId: SYSTEM_USER_ID,
        },
      }),
    );
    log.info({ tenantId, date: todayKey }, 'amc.campaign_draft_created');
  }

  log.info({ reminded }, 'amc_expiry_reminders.complete');
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

export function startAmcExpiryReminderScheduler(): void {
  const run = () => {
    void runAmcExpiryReminders().catch((err: unknown) =>
      log.error({ err }, 'amc_expiry_reminders.run_error'),
    );
  };

  // 8-min startup offset
  setTimeout(run, 8 * 60 * 1000);
  setInterval(run, CHECK_INTERVAL_MS);

  log.info({ intervalMs: CHECK_INTERVAL_MS }, 'amc_expiry_reminder_scheduler.started');
}
