import type { Prisma } from '@excess/db';

/**
 * Enrol a lead into every active sequence whose trigger matches the event.
 * Idempotent — skips sequences the lead is already enrolled in.
 * Runs inside the caller's tenant-scoped transaction.
 */
export async function enrollLeadInSequences(
  tx: Prisma.TransactionClient,
  tenantId: string,
  leadId: string,
  trigger: 'LEAD_STAGE' | 'PROJECT_STAGE',
  triggerValue: string,
): Promise<void> {
  const sequences = await tx.sequence.findMany({
    where: { tenantId, isActive: true, trigger, triggerValue },
    select: {
      id: true,
      steps: { orderBy: { stepOrder: 'asc' }, take: 1, select: { delayHours: true } },
    },
  });

  for (const seq of sequences) {
    const firstStep = seq.steps[0];
    if (!firstStep) continue; // sequence has no steps — nothing to schedule

    const existing = await tx.sequenceEnrollment.findUnique({
      where: { sequenceId_leadId: { sequenceId: seq.id, leadId } },
      select: { id: true },
    });
    if (existing) continue;

    await tx.sequenceEnrollment.create({
      data: {
        tenantId,
        sequenceId: seq.id,
        leadId,
        currentStep: 0,
        nextRunAt: new Date(Date.now() + firstStep.delayHours * 3600 * 1000),
      },
    });
  }
}
