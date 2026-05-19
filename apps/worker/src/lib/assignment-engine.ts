import pino from 'pino';
import type { PrismaClient } from '@excess/db';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

interface LeadContext {
  pincode?: string | null;
  city?: string | null;
  sourceType: string;
}

interface RuleCondition {
  pincodes?: string[];
  cities?: string[];
  sourceTypes?: string[];
}

function matchesCondition(condition: RuleCondition, lead: LeadContext): boolean {
  // Empty condition = catch-all (matches everything)
  const { pincodes, cities, sourceTypes } = condition;

  if (pincodes && pincodes.length > 0) {
    if (!lead.pincode || !pincodes.includes(lead.pincode)) return false;
  }
  if (cities && cities.length > 0) {
    if (!lead.city) return false;
    const lowerCity = lead.city.toLowerCase();
    if (!cities.some((c) => c.toLowerCase() === lowerCity)) return false;
  }
  if (sourceTypes && sourceTypes.length > 0) {
    if (!sourceTypes.includes(lead.sourceType)) return false;
  }

  return true;
}

export async function assignLead(
  tx: PrismaClient,
  tenantId: string,
  leadId: string,
  lead: LeadContext,
): Promise<void> {
  const rules = await tx.routingRule.findMany({
    where: { tenantId, isActive: true },
    orderBy: { priority: 'asc' },
    include: { targetTeam: { select: { id: true, name: true } } },
  });

  for (const rule of rules) {
    const condition = rule.condition as RuleCondition;
    if (!matchesCondition(condition, lead)) continue;

    // Found a matching rule — get team members ordered by creation
    const members = await tx.user.findMany({
      where: { teamId: rule.targetTeamId, isActive: true, tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (members.length === 0) {
      log.warn({ ruleId: rule.id, teamId: rule.targetTeamId }, 'assignment_engine.no_active_members');
      continue;
    }

    // Round-robin: pick next member atomically
    const nextIndex = rule.roundRobinIndex % members.length;
    const assignedUserId = members[nextIndex]!.id;

    // Atomically advance the round-robin counter
    await tx.routingRule.update({
      where: { id: rule.id },
      data: { roundRobinIndex: { increment: 1 } },
    });

    // Assign the lead
    await tx.lead.update({
      where: { id: leadId },
      data: { ownerUserId: assignedUserId, teamId: rule.targetTeamId },
    });

    await tx.leadActivity.create({
      data: {
        leadId,
        tenantId,
        actorIsAi: true,
        type: 'ASSIGNMENT',
        payload: {
          assignedTo: assignedUserId,
          ruleId: rule.id,
          reason: 'auto_routing',
        } as object,
      },
    });

    log.info(
      { tenantId, leadId, ruleId: rule.id, assignedUserId, teamId: rule.targetTeamId },
      'assignment_engine.assigned',
    );
    return;
  }

  log.info({ tenantId, leadId }, 'assignment_engine.no_matching_rule');
}
