// Single source of truth for franchise commission math, used by the synchronous
// conversion handler (apps/api), the commission-calc worker, and the manual
// POST /commissions endpoint. All internal math runs in Decimal — never JS floats.
//
// We import decimal.js directly (NOT Prisma.Decimal). This module is re-exported from
// @excess/shared, which is bundled into the Next.js web app; importing @prisma/client
// here needs a generated Prisma client at build time (the prod web build stage runs
// `pnpm install` without `prisma generate`), which breaks the web build. decimal.js is the
// exact Decimal implementation Prisma wraps — same math, pure JS, no generate dependency.
import { Decimal } from 'decimal.js';

export const DEFAULT_COMMISSION_PER_KW_INR = 1500;
const DEFAULT_GST_RATE = 0.18;

export interface CommissionResult {
  commissionInr: number;
  ratePercent: number;
  gstInr: number;
  netPayableInr: number;
}

export interface CommissionOpts {
  /** When set, commission = systemKw × per-kW rate (the current franchise rule). */
  systemKw?: number;
  // TODO(CM-02): whether GST is added, deducted, or not applied is a pending Finance
  // decision (OPEN_QUESTIONS.md). The default 'add' keeps the current worker behaviour
  // (+18%). Once Finance signs off, set the confirmed rule here in one place.
  gstMode?: 'add' | 'deduct' | 'none';
  gstRate?: number;
  deductionsInr?: number;
}

/**
 * Compute a franchise commission.
 * - With `systemKw`: commission = systemKw × per-kW rate (default ₹1,500, override via
 *   slabs.perKwInr). - Otherwise: legacy slab model — % of deal value by threshold.
 * GST is computed as commission × gstRate and applied per gstMode; deductions are subtracted.
 */
export function computeCommission(
  slabs: Record<string, number>,
  dealValueInr: number,
  opts: CommissionOpts = {},
): CommissionResult {
  const { systemKw, gstMode = 'add', gstRate = DEFAULT_GST_RATE, deductionsInr = 0 } = opts;
  const deal = new Decimal(dealValueInr);

  let commission: Decimal;
  let ratePercent: Decimal;

  if (systemKw && systemKw > 0) {
    const perKw = slabs['perKwInr'] && slabs['perKwInr'] > 0 ? slabs['perKwInr'] : DEFAULT_COMMISSION_PER_KW_INR;
    commission = new Decimal(systemKw).times(perKw);
    ratePercent = deal.gt(0) ? commission.div(deal).times(100) : new Decimal(0);
  } else {
    let rate = 5;
    const thresholds = Object.keys(slabs)
      .filter((k) => k !== 'perKwInr')
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
    for (const t of thresholds) {
      if (dealValueInr >= t) rate = slabs[String(t)] ?? rate;
    }
    ratePercent = new Decimal(rate);
    commission = deal.times(rate).div(100);
  }

  const gst = gstMode === 'none' ? new Decimal(0) : commission.times(gstRate);
  let net = commission;
  if (gstMode === 'add') net = net.plus(gst);
  else if (gstMode === 'deduct') net = net.minus(gst);
  net = net.minus(new Decimal(deductionsInr));

  return {
    commissionInr: commission.toNumber(),
    ratePercent: Math.round(ratePercent.toNumber() * 100) / 100,
    gstInr: gst.toNumber(),
    netPayableInr: net.toNumber(),
  };
}
