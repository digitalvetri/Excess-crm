import type { Job } from 'bullmq';
import { prisma, withSystemContext, createFranchiseCommission, Prisma } from '@excess/db';

export interface CommissionCalcPayload {
  leadId: string;
  tenantId: string;
}

export async function processCommissionCalc(job: Job<CommissionCalcPayload>): Promise<void> {
  const { leadId, tenantId } = job.data;

  try {
    const result = await withSystemContext(prisma, tenantId, async (tx) => {
      // Derive the real commission inputs from the lead's accepted quotation — the
      // same systemKw/deal value a human would see on the convert screen. Never a
      // hardcoded deal value (the old bug). No accepted quotation ⇒ no_value ⇒ skip.
      const quotation = await tx.quotation.findFirst({
        where: { leadId, status: 'ACCEPTED' },
        orderBy: { createdAt: 'desc' },
        select: { systemKw: true, totalInr: true },
      });

      return createFranchiseCommission(tx, {
        tenantId,
        leadId,
        ...(quotation
          ? { systemKw: quotation.systemKw.toNumber(), dealValueInr: quotation.totalInr.toNumber() }
          : {}),
      });
    });

    if (result.created) {
      await job.log(`Commission created: leadId=${leadId} net=₹${result.netPayableInr}`);
    } else {
      await job.log(`Commission not created for lead ${leadId}: ${result.reason}`);
    }
  } catch (err) {
    // Race against a concurrent create (e.g. the synchronous conversion handler) —
    // the @@unique([tenantId, leadId]) index makes this idempotent.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      await job.log(`Commission already exists for lead ${leadId} (duplicate) — skipping`);
      return;
    }
    throw err;
  }
}
