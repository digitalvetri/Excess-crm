'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Banknote, Plus } from 'lucide-react';
import {
  usePayouts,
  useCreatePayout,
  useFranchises,
  useCommissions,
  type Commission,
} from '@/hooks/use-franchise';
import { getApiErrorMessage } from '@/lib/api-error';

// ─── Create Payout Modal ──────────────────────────────────────────────────────

function CreatePayoutModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [franchiseId, setFranchiseId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bankUtr, setBankUtr] = useState('');

  const { data: franchises, isLoading: franchisesLoading } = useFranchises();
  const { data: commissionsData, isLoading: commissionsLoading } = useCommissions(
    franchiseId ? { franchiseId, status: 'APPROVED' } : undefined,
  );
  const approvedCommissions: Commission[] = franchiseId
    ? (commissionsData?.commissions ?? [])
    : [];

  const createPayout = useCreatePayout();

  function toggleCommission(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleFranchiseChange(id: string) {
    setFranchiseId(id);
    setSelected(new Set());
    if (id) setStep(2);
  }

  const selectedList = approvedCommissions.filter((c) => selected.has(c.id));
  const runningTotal = selectedList.reduce((sum, c) => sum + Number(c.netPayableInr), 0);

  async function handleConfirm() {
    if (selected.size === 0) {
      toast.error('Select at least one commission');
      return;
    }
    try {
      await createPayout.mutateAsync({
        commissionIds: Array.from(selected),
        ...(bankUtr.trim() ? { bankUtr: bankUtr.trim() } : {}),
      });
      toast.success('Payout created');
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to create payout'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Create Payout</h2>
          <span className="text-xs text-slate-400">Step {step} of 2</span>
        </div>

        {/* Step 1 — Select franchise */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Franchise</label>
          {franchisesLoading ? (
            <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
          ) : (
            <select
              value={franchiseId}
              onChange={(e) => handleFranchiseChange(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            >
              <option value="">— Select franchise —</option>
              {(franchises ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Step 2 — Select commissions */}
        {step === 2 && (
          <>
            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">
                Approved Commissions
              </p>
              {commissionsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : approvedCommissions.length === 0 ? (
                <div className="p-4 bg-slate-50 rounded-lg text-center">
                  <p className="text-sm text-slate-400">No approved commissions for this franchise.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {approvedCommissions.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleCommission(c.id)}
                        className="accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {c.leadName ?? c.leadId.slice(0, 12) + '…'}
                        </p>
                        <p className="text-xs text-slate-500">
                          Deal ₹{Number(c.dealValueInr).toLocaleString('en-IN')} · {c.ratePercent}%
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 whitespace-nowrap">
                        ₹{Number(c.netPayableInr).toLocaleString('en-IN')}
                      </p>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Running total */}
            <div className="flex items-center justify-between px-1 py-2 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-500">
                {selected.size} commission{selected.size !== 1 ? 's' : ''} selected
              </span>
              <span className="text-base font-bold text-slate-900">
                ₹{runningTotal.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Bank UTR */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Bank UTR — optional
              </label>
              <input
                type="text"
                value={bankUtr}
                onChange={(e) => setBankUtr(e.target.value)}
                placeholder="UTR reference number"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          {step === 1 ? (
            <button
              type="button"
              disabled={!franchiseId}
              onClick={() => setStep(2)}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={createPayout.isPending || selected.size === 0}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {createPayout.isPending ? 'Processing…' : 'Confirm Payout'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PayoutsPage() {
  const [showModal, setShowModal] = useState(false);
  const { data, isLoading } = usePayouts();
  const payouts = data?.payouts ?? [];

  return (
    <div className="space-y-6">
      {showModal && <CreatePayoutModal onClose={() => setShowModal(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Payouts</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track commission payouts to franchise partners.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} />
          Create Payout
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-white rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : payouts.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 sm:p-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Banknote className="text-slate-400" size={28} />
          </div>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">No payouts yet</h3>
          <p className="text-xs text-slate-400 mb-5 max-w-xs mx-auto">
            Approve commissions first, then batch them into a single bank transfer here.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            <Plus size={14} />
            Create first payout
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_180px_160px_140px_120px_120px] gap-4 px-5 py-2 bg-slate-50 border-b border-border text-xs font-medium text-slate-500 uppercase tracking-wide">
            <span>Franchise</span>
            <span>Amount</span>
            <span>Commissions</span>
            <span>Bank UTR</span>
            <span>Paid On</span>
            <span>Date Created</span>
          </div>
          <div className="divide-y divide-border">
            {payouts.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-1 md:grid-cols-[1fr_180px_160px_140px_120px_120px] gap-2 md:gap-4 px-5 py-3 items-center"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {p.franchiseName}
                  </p>
                  <p className="text-xs font-mono text-slate-400">{p.id.slice(0, 12)}…</p>
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  ₹{Number(p.amountInr).toLocaleString('en-IN')}
                </p>
                <p className="text-sm text-slate-600">
                  {p.commissionIds.length} commission{p.commissionIds.length !== 1 ? 's' : ''}
                </p>
                <p className="text-sm text-slate-500 font-mono truncate">
                  {p.bankUtr ?? '—'}
                </p>
                <p className="text-sm text-slate-600">
                  {format(new Date(p.paidAt), 'dd MMM yyyy')}
                </p>
                <p className="text-sm text-slate-400">
                  {format(new Date(p.createdAt), 'dd MMM yyyy')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
