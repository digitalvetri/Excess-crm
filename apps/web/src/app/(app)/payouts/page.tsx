'use client';

import { format } from 'date-fns';
import { Banknote } from 'lucide-react';
import { usePayouts } from '@/hooks/use-franchise';

export default function PayoutsPage() {
  const { data, isLoading } = usePayouts();
  const payouts = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Payouts</h1>
        <p className="text-sm text-slate-500 mt-0.5">Track commission payouts to franchise partners.</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-white rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : payouts.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <Banknote className="mx-auto mb-3 text-slate-300" size={32} />
          <p className="text-slate-500 text-sm">No payouts recorded yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_160px_140px_100px] gap-4 px-5 py-2 bg-slate-50 border-b border-border text-xs font-medium text-slate-500 uppercase tracking-wide">
            <span>Payout ID</span>
            <span>Amount</span>
            <span>Paid On</span>
            <span>Commissions</span>
          </div>
          <div className="divide-y divide-border">
            {payouts.map((p) => (
              <div key={p.id} className="grid grid-cols-1 md:grid-cols-[1fr_160px_140px_100px] gap-2 md:gap-4 px-5 py-3 items-center">
                <div>
                  <p className="text-sm font-mono text-slate-700">{p.id.slice(0, 12)}…</p>
                  {p.bankUtr && <p className="text-xs text-slate-500 mt-0.5">UTR: {p.bankUtr}</p>}
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  ₹{Number(p.amountInr).toLocaleString('en-IN')}
                </p>
                <p className="text-sm text-slate-600">{format(new Date(p.paidAt), 'dd MMM yyyy')}</p>
                <p className="text-sm text-slate-500">{p.commissionIds.length} commissions</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
