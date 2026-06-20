// Single source of truth for franchise commission math, used by both the
// synchronous conversion handler (apps/api) and the commission-calc worker.

export const DEFAULT_COMMISSION_PER_KW_INR = 1500;
const GST_RATE = 0.18;

export interface CommissionResult {
  commissionInr: number;
  ratePercent: number;
  gstInr: number;
  netPayableInr: number;
}

/**
 * Compute a franchise commission.
 * - If systemKw is given: commission = systemKw × per-kW rate (default ₹1,500,
 *   overridable via slabs.perKwInr). This is the current franchise rule.
 * - Otherwise: legacy slab model — % of deal value by threshold.
 */
export function computeCommission(
  slabs: Record<string, number>,
  dealValueInr: number,
  systemKw?: number,
): CommissionResult {
  let commissionInr: number;
  let ratePercent: number;

  if (systemKw && systemKw > 0) {
    const perKw = slabs['perKwInr'] && slabs['perKwInr'] > 0 ? slabs['perKwInr'] : DEFAULT_COMMISSION_PER_KW_INR;
    commissionInr = systemKw * perKw;
    ratePercent = dealValueInr > 0 ? Math.round((commissionInr / dealValueInr) * 10000) / 100 : 0;
  } else {
    ratePercent = 5;
    const thresholds = Object.keys(slabs)
      .filter((k) => k !== 'perKwInr')
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
    for (const t of thresholds) {
      if (dealValueInr >= t) ratePercent = slabs[String(t)] ?? ratePercent;
    }
    commissionInr = (dealValueInr * ratePercent) / 100;
  }

  const gstInr = commissionInr * GST_RATE;
  return { commissionInr, ratePercent, gstInr, netPayableInr: commissionInr + gstInr };
}
