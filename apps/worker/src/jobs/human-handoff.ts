import type { Job } from 'bullmq';
import { prisma, withSystemContext } from '@excess/db';
import { queues } from '../queues.js';

export interface HumanHandoffPayload {
  leadId: string;
  tenantId: string;
}

export async function processHumanHandoff(job: Job<HumanHandoffPayload>): Promise<void> {
  const { leadId, tenantId } = job.data;

  const lead = await withSystemContext(prisma, tenantId, (tx) =>
    tx.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true, tenantId: true, name: true, phone: true,
        city: true, sourceType: true, stage: true,
      },
    }),
  );

  if (!lead || lead.stage !== 'CONVERTED') {
    await job.log(`Lead ${leadId} not found or not CONVERTED — skipping handoff`);
    return;
  }

  // routing_rules has RLS — use withSystemContext
  const rules = await withSystemContext(prisma, tenantId, (tx) =>
    tx.routingRule.findMany({
      where: { tenantId, isActive: true },
      orderBy: { priority: 'asc' },
      include: { targetTeam: { select: { id: true, name: true } } },
    }),
  );

  let targetTeamId: string | null = null;
  for (const rule of rules) {
    const cond = rule.condition as Record<string, unknown>;
    if (!cond['sourceType'] || cond['sourceType'] === lead.sourceType) {
      targetTeamId = rule.targetTeamId;
      break;
    }
  }

  // users table has no RLS — direct prisma query is fine
  let assignedUserId: string | null = null;
  if (targetTeamId) {
    const teamMembers = await prisma.user.findMany({
      where: { tenantId, teamId: targetTeamId, isActive: true, role: { in: ['EMPLOYEE'] } },
      select: { id: true },
    });

    if (teamMembers.length > 0) {
      // Count open leads per member — leads has RLS
      const counts = await Promise.all(
        teamMembers.map(async (m) => ({
          id: m.id,
          count: await withSystemContext(prisma, tenantId, (tx) =>
            tx.lead.count({
              where: { ownerUserId: m.id, stage: { in: ['NEW', 'QUALIFIED', 'FOLLOW_UP'] } },
            }),
          ),
        })),
      );
      const lightest = counts.reduce((a, b) => (a.count <= b.count ? a : b));
      assignedUserId = lightest.id;
    }
  }

  if (assignedUserId ?? targetTeamId) {
    await withSystemContext(prisma, tenantId, async (tx) => {
      await tx.lead.update({
        where: { id: leadId },
        data: {
          ...(assignedUserId && { ownerUserId: assignedUserId }),
          ...(targetTeamId && { teamId: targetTeamId }),
        },
      });

      await tx.leadActivity.create({
        data: {
          leadId,
          tenantId,
          actorIsAi: true,
          type: 'ASSIGNMENT',
          payload: { assignedUserId, teamId: targetTeamId, source: 'human_handoff' } as object,
        },
      });
    });
  }

  await queues.whatsappSend.add('send-converted-notification', {
    tenantId,
    leadId,
    phone: lead.phone,
    template: 'CONVERSION_CONFIRMATION',
    vars: { name: lead.name },
  });

  if (assignedUserId) {
    // users table has no RLS
    const agent = await prisma.user.findUnique({
      where: { id: assignedUserId },
      select: { email: true, name: true },
    });

    if (agent) {
      await queues.emailSend.add('notify-agent-new-lead', {
        tenantId,
        to: agent.email,
        subject: `New converted lead assigned: ${lead.name}`,
        template: 'AGENT_LEAD_ASSIGNED',
        vars: {
          agentName: agent.name,
          leadName: lead.name,
          leadPhone: lead.phone,
          leadCity: lead.city ?? '',
        },
      });
    }
  }

  await queues.commissionCalc.add('commission-calc', {
    leadId,
    tenantId,
    dealValueInr: 300000,
  });

  await job.log(`Handoff complete: lead=${leadId} agent=${assignedUserId ?? 'unassigned'} team=${targetTeamId ?? 'none'}`);
}
