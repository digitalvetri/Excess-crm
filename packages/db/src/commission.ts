// Single shared routine for creating a franchise commission on lead conversion.
// Used by BOTH the synchronous conversion handler (apps/api leads.ts) and the
// commission-calc worker so the two paths can never compute or persist different
// amounts. All money math runs through computeCommission (Decimal-based).
//
// The caller MUST invoke this inside a tenant-scoped transaction
// (withTenant / withSystemContext) — it touches the RLS-protected `commissions`
// table and the `tenants` table.
//
// Idempotency: a pre-check (findFirst) is the effective guard today; once the
// @@unique([tenantId, leadId]) index lands in the DB, a concurrent insert raises
// P2002. We deliberately do NOT catch P2002 here — a constraint violation aborts
// the surrounding Postgres transaction, so swallowing it and returning would make
// the wrapper COMMIT an aborted tx. Callers catch P2002 OUTSIDE the wrapper and
// map it to `already_exists`.
import { Prisma } from '@prisma/client';
import { computeCommission } from '@excess/shared';

export type FranchiseCommissionResult =
  | { created: true; commissionId: string; netPayableInr: string }
  | { created: false; reason: 'not_franchise' | 'no_value' | 'already_exists' };

export interface FranchiseCommissionInput {
  tenantId: string;
  leadId: string;
  /** Deal value in INR (quotation total). Optional — kW path drives the amount. */
  dealValueInr?: number;
  /** Installed system size in kW. When present, commission = systemKw × per-kW rate. */
  systemKw?: number;
  deductionsInr?: number;
}

export async function createFranchiseCommission(
  tx: Prisma.TransactionClient,
  input: FranchiseCommissionInput,
): Promise<FranchiseCommissionResult> {
  const { tenantId, leadId, dealValueInr, systemKw, deductionsInr } = input;

  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: { type: true, commissionSlabs: true },
  });
  if (!tenant || tenant.type !== 'FRANCHISE') {
    return { created: false, reason: 'not_franchise' }; // commissions are franchise-only
  }

  // Never fabricate a value — without a kW figure or a deal value there is nothing
  // to compute (this is exactly the bug the voice path used to have).
  if (systemKw === undefined && dealValueInr === undefined) {
    return { created: false, reason: 'no_value' };
  }

  const existing = await tx.commission.findFirst({
    where: { leadId, tenantId },
    select: { id: true },
  });
  if (existing) return { created: false, reason: 'already_exists' }; // idempotent

  const slabs = (tenant.commissionSlabs ?? {}) as Record<string, number>;
  const c = computeCommission(slabs, dealValueInr ?? 0, {
    ...(systemKw !== undefined ? { systemKw } : {}),
    ...(deductionsInr !== undefined ? { deductionsInr } : {}),
  });

  const created = await tx.commission.create({
    data: {
      tenantId,
      leadId,
      dealValueInr: dealValueInr ?? 0,
      ratePercent: c.ratePercent,
      commissionInr: c.commissionInr,
      gstInr: c.gstInr,
      netPayableInr: c.netPayableInr,
      ...(deductionsInr !== undefined ? { deductionsInr } : {}),
      status: 'PENDING_APPROVAL',
    },
    select: { id: true, netPayableInr: true },
  });

  return { created: true, commissionId: created.id, netPayableInr: created.netPayableInr.toString() };
}
