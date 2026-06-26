import type { Job } from 'bullmq';
import { prisma, withSystemContext } from '@excess/db';
import { computeCommission } from '@excess/shared';

export interface CommissionCalcPayload {
  leadId: string;
  tenantId: string;
  dealValueInr: number;
  /** Installed system size in kW. When present, commission = systemKw × per-kW rate. */
  systemKw?: number;
}

export async function processCommissionCalc(job: Job<CommissionCalcPayload>): Promise<void> {
  const { leadId, tenantId, dealValueInr, systemKw } = job.data;

  // tenants table has no RLS — direct query is fine
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { commissionSlabs: true, type: true },
  });

  if (!tenant || tenant.type !== 'FRANCHISE') {
    await job.log(`Tenant ${tenantId} is not a franchise — skipping commission calc`);
    return;
  }

  const slabs = (tenant.commissionSlabs ?? {}) as Record<string, number>;
  const { commissionInr, ratePercent, gstInr, netPayableInr } = computeCommission(slabs, dealValueInr, systemKw ? { systemKw } : {});

  // commissions table has RLS
  await withSystemContext(prisma, tenantId, async (tx) => {
    const existing = await tx.commission.findFirst({ where: { leadId, tenantId } });
    if (existing) {
      await job.log(`Commission already exists for lead ${leadId} — skipping`);
      return;
    }

    await tx.commission.create({
      data: {
        tenantId,
        leadId,
        dealValueInr,
        ratePercent,
        commissionInr,
        gstInr,
        netPayableInr,
        status: 'PENDING_APPROVAL',
      },
    });

    await job.log(`Commission created: leadId=${leadId} rate=${ratePercent}% net=₹${netPayableInr}`);
  });
}
