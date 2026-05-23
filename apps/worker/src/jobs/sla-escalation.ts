import { randomUUID } from 'crypto';
import pino from 'pino';
import { prisma, withSystemContext, Prisma } from '@excess/db';
import { redis } from '../redis.js';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

// ── Lead SLA constants ────────────────────────────────────────────────────────

const LEAD_SLA_DEDUP_TTL_SEC = 7 * 24 * 3600;

// ── Service ticket SLA constants ──────────────────────────────────────────────

const SVC_SLA_HOURS: Record<string, number>       = { P1: 24, P2: 48,  P3: 120, P4: 240 };
const SVC_ALERT_HOURS: Record<string, number>     = { P1: 18, P2: 36,  P3: 90,  P4: 180 };
const SVC_P1_UNASSIGNED_ALERT_HOURS               = 2;

interface SvcActivityEntry {
  id: string;
  type: string;
  text?: string;
  authorName: string;
  authorId: string;
  createdAt: string;
}

function parseSvcLog(raw: unknown): SvcActivityEntry[] {
  return Array.isArray(raw) ? (raw as SvcActivityEntry[]) : [];
}

// ── Lead SLA escalation ───────────────────────────────────────────────────────

export async function runSlaEscalation(): Promise<void> {
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
          where: { tenantId, stage: rule.stage, stageChangedAt: { lte: thresholdDate } },
          select: { id: true, name: true, ownerUserId: true, stage: true },
          take: 100,
        }),
      );

      for (const lead of overdueLeads) {
        const dedupKey = `sla:notified:${rule.id}:${lead.id}`;
        if (await redis.exists(dedupKey)) continue;
        await redis.setex(dedupKey, LEAD_SLA_DEDUP_TTL_SEC, '1');

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

// ── Service ticket SLA escalation ─────────────────────────────────────────────

export async function runServiceTicketSlaEscalation(): Promise<void> {
  const tickets = await prisma.serviceTicket.findMany({
    where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
    select: {
      id: true, tenantId: true, priority: true, assignedEngineerId: true,
      createdAt: true, activityLog: true, subject: true,
    },
    take: 1000,
  });

  if (tickets.length === 0) return;

  let escalated = 0;

  for (const ticket of tickets) {
    const ageHours  = (Date.now() - new Date(ticket.createdAt).getTime()) / 3600000;
    const slaHours  = SVC_SLA_HOURS[ticket.priority]   ?? 120;
    const alertAt   = SVC_ALERT_HOURS[ticket.priority] ?? 90;
    const isOverdue = ageHours >= slaHours;
    const isAtRisk  = !isOverdue && ageHours >= alertAt;
    const isP1Unassigned = ticket.priority === 'P1'
      && !ticket.assignedEngineerId
      && ageHours >= SVC_P1_UNASSIGNED_ALERT_HOURS;

    const newEntries: SvcActivityEntry[] = [];
    const now = new Date().toISOString();

    if (isP1Unassigned) {
      const key = `svc-sla:p1unassigned:${ticket.id}`;
      if (!(await redis.exists(key))) {
        await redis.setex(key, 20 * 3600, '1');
        newEntries.push({
          id: randomUUID(),
          type: 'sla_breach',
          text: `⚠️ P1 ticket unassigned for ${Math.round(ageHours)}h — assign an engineer immediately`,
          authorName: 'System',
          authorId: 'system',
          createdAt: now,
        });
      }
    }

    if (isOverdue) {
      const key = `svc-sla:overdue:${ticket.id}`;
      if (!(await redis.exists(key))) {
        await redis.setex(key, 7 * 24 * 3600, '1');
        newEntries.push({
          id: randomUUID(),
          type: 'sla_breach',
          text: `🔴 SLA breached — ${ticket.priority} ticket open for ${Math.round(ageHours)}h (limit: ${slaHours}h)`,
          authorName: 'System',
          authorId: 'system',
          createdAt: now,
        });
      }
    } else if (isAtRisk) {
      const key = `svc-sla:atrisk:${ticket.id}`;
      if (!(await redis.exists(key))) {
        await redis.setex(key, 12 * 3600, '1');
        newEntries.push({
          id: randomUUID(),
          type: 'sla_breach',
          text: `🟡 SLA at risk — ${ticket.priority} ticket open for ${Math.round(ageHours)}h, resolve within ${Math.round(slaHours - ageHours)}h`,
          authorName: 'System',
          authorId: 'system',
          createdAt: now,
        });
      }
    }

    if (newEntries.length === 0) continue;

    const currentLog = parseSvcLog(ticket.activityLog);
    const updatedLog = [...currentLog, ...newEntries];

    await withSystemContext(prisma, ticket.tenantId, (tx) =>
      tx.serviceTicket.update({
        where: { id: ticket.id },
        data: { activityLog: updatedLog as unknown as Prisma.InputJsonValue[] },
      }),
    );

    escalated++;
    log.info({ tenantId: ticket.tenantId, ticketId: ticket.id, entries: newEntries.length }, 'svc_sla.escalated');
  }

  log.info({ checked: tickets.length, escalated }, 'svc_sla_escalation.complete');
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes

export function startSlaEscalationScheduler(): void {
  const run = () => {
    void Promise.all([
      runSlaEscalation().catch((err: unknown) => log.error({ err }, 'lead_sla.run_error')),
      runServiceTicketSlaEscalation().catch((err: unknown) => log.error({ err }, 'svc_sla.run_error')),
    ]).then(() => log.info('sla_escalation.run_complete'));
  };

  // 5-min startup offset to avoid contention with other schedulers
  setTimeout(run, 5 * 60 * 1000);
  setInterval(run, CHECK_INTERVAL_MS);

  log.info({ intervalMs: CHECK_INTERVAL_MS }, 'sla_escalation_scheduler.started');
}
