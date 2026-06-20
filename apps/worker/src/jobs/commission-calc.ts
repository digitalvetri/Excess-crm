import type { Job } from 'bullmq';
import { prisma, withSystemContext } from '@excess/db';

// Default franchise commission: ₹1,500 per kW of installed system size.
// Override per-franchise via tenant.commissionSlabs.perKwInr.
const DEFAULT_COMMISSION_PER_KW_INR = 1500;

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

  let commissionInr: number;
  let ratePercent: number;

  if (systemKw && systemKw > 0) {
    // Per-kW model (current franchise rule): commission = kW × ₹/kW.
    const perKw = slabs['perKwInr'] && slabs['perKwInr'] > 0 ? slabs['perKwInr'] : DEFAULT_COMMISSION_PER_KW_INR;
    commissionInr = systemKw * perKw;
    // Effective % of deal value, for display consistency (0 if no deal value).
    ratePercent = dealValueInr > 0 ? Math.round((commissionInr / dealValueInr) * 10000) / 100 : 0;
    await job.log(`Per-kW commission: ${systemKw}kW × ₹${perKw} = ₹${commissionInr}`);
  } else {
    // Legacy slab model: % of deal value.
    ratePercent = 5;
    const thresholds = Object.keys(slabs)
      .filter((k) => k !== 'perKwInr')
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
    for (const threshold of thresholds) {
      if (dealValueInr >= threshold) {
        ratePercent = slabs[String(threshold)] ?? ratePercent;
      }
    }
    commissionInr = (dealValueInr * ratePercent) / 100;
  }

  const gstInr = commissionInr * 0.18;
  const netPayableInr = commissionInr + gstInr;

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
