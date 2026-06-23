'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useUpdateLead } from '@/hooks/use-leads';

type CommissionOutcome =
  | { created: true; netPayableInr: number }
  | { created: false; reason: 'not_franchise' | 'no_value' | 'already_exists' | 'error' };

// Captures the installed system size when converting a lead. Franchise commission
// is ₹1,500 per kW, so the kW is required to compute it.
export function ConvertLeadModal({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const [systemKw, setSystemKw] = useState('');
  const [dealValue, setDealValue] = useState('');
  const { mutate, isPending } = useUpdateLead();

  const kw = Number(systemKw);
  const canSubmit = systemKw.trim() !== '' && kw > 0;
  const estCommission = canSubmit ? kw * 1500 : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    mutate(
      {
        id: leadId,
        data: {
          stage: 'CONVERTED',
          systemKw: kw,
          ...(dealValue.trim() && Number(dealValue) > 0 && { dealValueInr: Number(dealValue) }),
        },
      },
      {
        onSuccess: (res: unknown) => {
          // The API reports whether a commission was created and, if not, why —
          // so the franchise user gets a clear answer instead of a silent no-op.
          const outcome = (res as { meta?: { commission?: CommissionOutcome } })?.meta?.commission;
          if (outcome?.created) {
            toast.success(`Lead converted — ₹${outcome.netPayableInr.toLocaleString('en-IN')} commission created`);
          } else if (outcome?.reason === 'not_franchise') {
            toast.warning("Lead converted, but no commission: this account isn't a franchise tenant.");
          } else if (outcome?.reason === 'no_value') {
            toast.warning('Lead converted, but enter a system size (kW) to generate the commission.');
          } else if (outcome?.reason === 'already_exists') {
            toast.success('Lead converted — a commission already exists for it.');
          } else if (outcome?.reason === 'error') {
            toast.error("Lead converted, but the commission couldn't be created. Please retry.");
          } else {
            toast.success('Lead converted');
          }
          onClose();
        },
        onError: (err: unknown) => {
          const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
          toast.error(axiosErr.response?.data?.error?.message ?? 'Failed to convert lead');
        },
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">Mark as Converted</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-5 py-5">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              System size (kW) <span className="text-danger">*</span>
            </label>
            <input
              value={systemKw}
              onChange={(e) => setSystemKw(e.target.value)}
              type="number"
              min="0"
              step="0.1"
              placeholder="e.g. 5"
              autoFocus
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {canSubmit && (
              <p className="mt-1.5 text-xs text-success">
                Commission: {kw} kW × ₹1,500 = <span className="font-semibold">₹{estCommission.toLocaleString('en-IN')}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Deal value (₹) <span className="text-slate-400">optional</span></label>
            <input
              value={dealValue}
              onChange={(e) => setDealValue(e.target.value)}
              type="number"
              min="0"
              placeholder="e.g. 350000"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || isPending}
              className="rounded-lg bg-success px-4 py-2 text-sm font-medium text-white hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Converting…' : 'Convert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
