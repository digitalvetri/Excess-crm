'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateQuotation } from '@/hooks/use-quotations';

type BrandTier = 'ECONOMY' | 'MID' | 'PREMIUM';

export default function NewQuotationPage() {
  const router = useRouter();
  const { create, loading, error } = useCreateQuotation();

  const [leadId, setLeadId] = useState('');
  const [systemKw, setSystemKw] = useState('');
  const [brandTier, setBrandTier] = useState<BrandTier>('ECONOMY');
  const [totalInr, setTotalInr] = useState('');
  const [subsidyInr, setSubsidyInr] = useState('');
  const [emiMonthly, setEmiMonthly] = useState('');
  const [paybackYears, setPaybackYears] = useState('');

  const total = parseFloat(totalInr) || 0;
  const subsidy = parseFloat(subsidyInr) || 0;
  const netPayable = total - subsidy;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await create({
        leadId: leadId.trim(),
        systemKw: parseFloat(systemKw),
        brandTier,
        totalInr: total,
        subsidyInr: subsidy,
        netPayable,
        ...(emiMonthly ? { emiMonthly: parseFloat(emiMonthly) } : {}),
        ...(paybackYears ? { paybackYears: parseFloat(paybackYears) } : {}),
      });
      router.push('/quotations');
    } catch {
      // error is already set by the hook
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">New Quotation</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-border p-6 space-y-5">
        {/* Lead ID */}
        <div className="space-y-1.5">
          <label htmlFor="leadId" className="block text-sm font-medium text-slate-700">
            Lead UUID
          </label>
          <input
            id="leadId"
            type="text"
            required
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            placeholder="Lead UUID"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          />
        </div>

        {/* System kW */}
        <div className="space-y-1.5">
          <label htmlFor="systemKw" className="block text-sm font-medium text-slate-700">
            System (kW)
          </label>
          <input
            id="systemKw"
            type="number"
            required
            min="0"
            step="0.01"
            value={systemKw}
            onChange={(e) => setSystemKw(e.target.value)}
            placeholder="e.g. 5"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          />
        </div>

        {/* Brand Tier */}
        <div className="space-y-1.5">
          <label htmlFor="brandTier" className="block text-sm font-medium text-slate-700">
            Brand Tier
          </label>
          <select
            id="brandTier"
            value={brandTier}
            onChange={(e) => setBrandTier(e.target.value as BrandTier)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          >
            <option value="ECONOMY">Economy</option>
            <option value="MID">Mid</option>
            <option value="PREMIUM">Premium</option>
          </select>
        </div>

        {/* Total */}
        <div className="space-y-1.5">
          <label htmlFor="totalInr" className="block text-sm font-medium text-slate-700">
            Total (₹)
          </label>
          <input
            id="totalInr"
            type="number"
            required
            min="0"
            step="0.01"
            value={totalInr}
            onChange={(e) => setTotalInr(e.target.value)}
            placeholder="e.g. 350000"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          />
        </div>

        {/* Subsidy */}
        <div className="space-y-1.5">
          <label htmlFor="subsidyInr" className="block text-sm font-medium text-slate-700">
            Subsidy (₹)
          </label>
          <input
            id="subsidyInr"
            type="number"
            required
            min="0"
            step="0.01"
            value={subsidyInr}
            onChange={(e) => setSubsidyInr(e.target.value)}
            placeholder="e.g. 78000"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          />
        </div>

        {/* Net Payable (read-only) */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">
            Net Payable (₹)
          </label>
          <div className="w-full px-3 py-2 border border-slate-100 rounded-lg text-sm text-slate-700 bg-slate-50">
            {netPayable >= 0
              ? `₹${netPayable.toLocaleString('en-IN')}`
              : '—'}
          </div>
        </div>

        {/* EMI Monthly (optional) */}
        <div className="space-y-1.5">
          <label htmlFor="emiMonthly" className="block text-sm font-medium text-slate-700">
            EMI Monthly (₹) <span className="text-slate-400 font-normal">optional</span>
          </label>
          <input
            id="emiMonthly"
            type="number"
            min="0"
            step="0.01"
            value={emiMonthly}
            onChange={(e) => setEmiMonthly(e.target.value)}
            placeholder="e.g. 4500"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          />
        </div>

        {/* Payback Years (optional) */}
        <div className="space-y-1.5">
          <label htmlFor="paybackYears" className="block text-sm font-medium text-slate-700">
            Payback (years) <span className="text-slate-400 font-normal">optional</span>
          </label>
          <input
            id="paybackYears"
            type="number"
            min="0"
            step="0.1"
            value={paybackYears}
            onChange={(e) => setPaybackYears(e.target.value)}
            placeholder="e.g. 5"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {loading ? 'Creating…' : 'Create Quotation'}
          </button>
        </div>
      </form>
    </div>
  );
}
