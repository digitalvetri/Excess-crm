import pino from 'pino';
import { prisma, withSystemContext, SYSTEM_TENANT_ID, Prisma } from '@excess/db';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

// DPDP retention: anonymize leads older than 2 years in terminal stages.
// Anonymize: set name='[Anonymized]', phone='0000000000', phoneRaw='0000000000', email=null
// Do NOT delete — keep for audit/analytics with PII removed.

export async function runDataRetention(): Promise<void> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 2);

  // SYSTEM_TENANT_ID + admin bypass lets this cross-tenant job touch all tenants' leads
  const result = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
    tx.lead.updateMany({
      where: {
        stage: { in: ['CONVERTED', 'INVALID', 'WRONG_ENQUIRY'] },
        createdAt: { lt: cutoff },
        name: { not: '[Anonymized]' }, // idempotent
      },
      data: {
        name: '[Anonymized]',
        phone: '0000000000',
        phoneRaw: '0000000000',
        email: null,
        factSheet: Prisma.DbNull,
      },
    }),
  );

  log.info({ count: result.count, cutoff: cutoff.toISOString() }, 'data_retention.anonymized');
}

async function auditDndLeaks(): Promise<void> {
  // dnd_list has no RLS — direct query is fine
  const dndPhones = await prisma.dndList.findMany({ select: { phone: true } });
  if (dndPhones.length === 0) return;

  const phones = dndPhones.map((d) => d.phone);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // calls has RLS — cross-tenant audit via admin bypass
  const leaked = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
    tx.call.count({
      where: {
        toNumber: { in: phones },
        initiatedAt: { gte: since },
      },
    }),
  );

  if (leaked > 0) {
    log.warn(
      { count: leaked },
      'dnd_audit.leak_detected — calls placed to DND numbers in last 30 days',
    );
  } else {
    log.info({ count: 0 }, 'dnd_audit.clean');
  }
}

export async function runDailyCompliance(): Promise<void> {
  await runDataRetention();
  await auditDndLeaks();
}
