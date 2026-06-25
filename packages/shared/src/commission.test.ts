import { describe, it, expect } from 'vitest';
import { computeCommission, DEFAULT_COMMISSION_PER_KW_INR } from './commission.js';

// These are INVARIANTS of intended behaviour (per the franchise rule: ₹1,500/kW + 18%
// GST), not snapshots of current output. A failure here is a real money bug.
describe('computeCommission — franchise money-path invariants', () => {
  describe('₹/kW rule (current franchise model)', () => {
    it('default per-kW rate is ₹1,500', () => {
      expect(DEFAULT_COMMISSION_PER_KW_INR).toBe(1500);
    });
    it('commission = systemKw × ₹1,500 by default', () => {
      expect(computeCommission({}, 300000, 5).commissionInr).toBe(5 * 1500);
    });
    it('slabs.perKwInr overrides the default rate', () => {
      expect(computeCommission({ perKwInr: 2000 }, 300000, 5).commissionInr).toBe(10000);
    });
    it('ignores a zero/negative perKwInr override (falls back to ₹1,500)', () => {
      expect(computeCommission({ perKwInr: 0 }, 300000, 5).commissionInr).toBe(7500);
      expect(computeCommission({ perKwInr: -5 }, 300000, 5).commissionInr).toBe(7500);
    });
    it('fractional kW computes proportionally', () => {
      expect(computeCommission({}, 300000, 5.5).commissionInr).toBe(8250);
    });
  });

  describe('GST + net-payable invariants (must always hold)', () => {
    it('GST is exactly 18% of commission', () => {
      const r = computeCommission({}, 300000, 10);
      expect(r.gstInr).toBeCloseTo(r.commissionInr * 0.18, 6);
    });
    it('net payable = commission + GST', () => {
      const r = computeCommission({}, 300000, 7);
      expect(r.netPayableInr).toBeCloseTo(r.commissionInr + r.gstInr, 6);
    });
    it('net payable = commission × 1.18', () => {
      const r = computeCommission({}, 250000, 4);
      expect(r.netPayableInr).toBeCloseTo(r.commissionInr * 1.18, 6);
    });
    it('commission and GST are never negative for valid inputs', () => {
      for (const kw of [0.5, 1, 3, 10, 100]) {
        const r = computeCommission({}, 100000, kw);
        expect(r.commissionInr).toBeGreaterThanOrEqual(0);
        expect(r.gstInr).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('rate% derivation', () => {
    it('rate% = commission / dealValue × 100', () => {
      // 10 kW × ₹1,500 = ₹15,000 on a ₹100,000 deal → 15%
      expect(computeCommission({}, 100000, 10).ratePercent).toBe(15);
    });
    it('no divide-by-zero when dealValue is 0 (rate 0, commission still computed)', () => {
      const r = computeCommission({}, 0, 5);
      expect(r.ratePercent).toBe(0);
      expect(r.commissionInr).toBe(7500);
    });
  });

  describe('legacy slab model (no systemKw)', () => {
    it('defaults to 5% of deal value', () => {
      const r = computeCommission({}, 200000);
      expect(r.ratePercent).toBe(5);
      expect(r.commissionInr).toBe(10000);
    });
    it('picks the highest threshold rate the deal qualifies for', () => {
      const slabs = { '0': 5, '500000': 7, '1000000': 10 };
      expect(computeCommission(slabs, 100000).ratePercent).toBe(5);
      expect(computeCommission(slabs, 600000).ratePercent).toBe(7);
      expect(computeCommission(slabs, 1200000).ratePercent).toBe(10);
    });
    it('systemKw = 0 falls through to the slab model', () => {
      expect(computeCommission({}, 200000, 0).ratePercent).toBe(5);
    });
    it('slab commission still carries 18% GST', () => {
      const r = computeCommission({}, 200000);
      expect(r.netPayableInr).toBeCloseTo(r.commissionInr * 1.18, 6);
    });
  });
});
