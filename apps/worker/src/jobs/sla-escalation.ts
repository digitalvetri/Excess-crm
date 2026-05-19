import pino from 'pino';
import { prisma, withSystemContext } from '@excess/db';
import { redis } from '../redis.js';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const SLA_DEDUP_TTL_SEC = 7 * 24 * 3600; // 7 days — don't re-escalate same lead+rule within 7 days

export async function runSlaEscalation(): Promise<void> {
  // Load all active SLA rules across all tenants
  const rules = await prisma.slaRule.findMany({
    where: { isActive: true },
    orderBy: { thresholdHours: 'asc' },
  });

  if (rules.length === 0) return;

  const grouped = new Map<string, typeof rules>();
  for (const rule of rules) {
    const arr = grouped.get(rule.tenantId) ?? [];
    arr.push(rule);
    grouped.set(rule.tenantId, arr);
  }

  for (const [tenantId, tenantRules] of grouped.entries()) {
    for (const rule of tenantRules) {
      const thresholdDate = new Date(Date.now() - rule.thresholdHours * 3600 * 1000);

      const overdueLeads = await withSystemContext(prisma, tenantId, (tx) =>
        tx.lead.findMany({
          where: {
            tenantId,
            stage: rule.stage,
            stageChangedAt: { lte: thresholdDate },
          },
          select: { id: true, name: true, ownerUserId: true, stage: true },
          take: 100,
        }),
      );

      for (const lead of overdueLeads) {
        const dedupKey = `sla:notified:${rule.id}:${lead.id}`;
        const alreadyNotified = await redis.exists(dedupKey);
        if (alreadyNotified) continue;

        await redis.setex(dedupKey, SLA_DEDUP_TTL_SEC, '1');

        if (rule.action === 'NOTIFY') {
          await withSystemContext(prisma, tenantId, (tx) =>
            tx.leadActivity.create({
              data: {
                leadId: lead.id,
                tenantId,
                actorIsAi: true,
                type: 'NOTE',
                payload: {
                  note: `⚠️ SLA alert: lead has been in ${rule.stage.replace(/_/g, ' ')} for over ${rule.thresholdHours}h without progress`,
                  slaRuleId: rule.id,
                  escalationType: 'NOTIFY',
                } as object,
              },
            }),
          );
          log.info({ tenantId, leadId: lead.id, ruleId: rule.id, stage: rule.stage }, 'sla.notified');
        } else if (rule.action === 'REASSIGN' && rule.notifyUserId) {
          await withSystemContext(prisma, tenantId, (tx) =>
            tx.lead.update({
              where: { id: lead.id },
              data: { ownerUserId: rule.notifyUserId },
            }),
          );
          await withSystemContext(prisma, tenantId, (tx) =>
            tx.leadActivity.create({
              data: {
                leadId: lead.id,
                tenantId,
                actorIsAi: true,
                type: 'ASSIGNMENT',
                payload: {
                  assignedTo: rule.notifyUserId,
                  reason: `SLA escalation: ${rule.thresholdHours}h threshold exceeded in ${rule.stage}`,
                  slaRuleId: rule.id,
                } as object,
              },
            }),
          );
          log.info({ tenantId, leadId: lead.id, ruleId: rule.id, reassignedTo: rule.notifyUserId }, 'sla.reassigned');
        }
      }
    }
  }

  log.info({ ruleCount: rules.length }, 'sla_escalation.complete');
}

const SLA_CHECK_INTERVAL_MS = 60 * 60 * 1000; // every hour

export function startSlaEscalationScheduler(): void {
  const run = () => {
    void runSlaEscalation()
      .then(() => log.info('sla_escalation.run_complete'))
      .catch((err: unknown) => log.error({ err }, 'sla_escalation.run_error'));
  };

  // Run once at startup (offset by 5 min to avoid startup contention)
  setTimeout(run, 5 * 60 * 1000);

  setInterval(run, SLA_CHECK_INTERVAL_MS);

  log.info({ intervalMs: SLA_CHECK_INTERVAL_MS }, 'sla_escalation_scheduler.started');
}
