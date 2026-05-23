'use client';

import Link from 'next/link';
import { Building2, AlertCircle, Loader } from 'lucide-react';
import { useNetworkSummary } from '@/hooks/use-franchise';

export function FranchiseSnapshot() {
  const { data, isLoading } = useNetworkSummary();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-white p-5">
        <Loader size={20} className="animate-spin text-slate-300" />
      </div>
    );
  }

  const d = data ?? {
    total: 0, active: 0, onboarding: 0, suspended: 0, probation: 0,
    pendingCommissionCount: 0, pendingCommissionInr: '0',
  };

  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-primary" />
          <h2 className="font-semibold text-slate-800">Franchise Network</h2>
        </div>
        <Link href="/franchise" className="text-sm font-medium text-primary hover:underline">
          Manage →
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-primary/5 p-3">
          <p className="text-2xl font-bold text-slate-800">{d.active}</p>
          <p className="mt-0.5 text-xs text-slate-500">Active cities</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-2xl font-bold text-slate-800">{d.total}</p>
          <p className="mt-0.5 text-xs text-slate-500">Total franchises</p>
        </div>
      </div>

      <div className="space-y-2">
        {d.pendingCommissionCount > 0 && (
          <Link
            href="/franchise"
            className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 transition-colors hover:bg-amber-100"
          >
            <AlertCircle size={16} className="shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-900">
                {d.pendingCommissionCount} commission{d.pendingCommissionCount > 1 ? 's' : ''} pending
              </p>
              <p className="text-xs text-amber-700">
                ₹{Number(d.pendingCommissionInr).toLocaleString('en-IN')} to approve
              </p>
            </div>
          </Link>
        )}

        {d.onboarding > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" />
            <p className="text-xs text-sky-700">
              {d.onboarding} franchise{d.onboarding > 1 ? 's' : ''} in onboarding
            </p>
          </div>
        )}

        {d.suspended > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />
            <p className="text-xs text-danger">
              {d.suspended} franchise{d.suspended > 1 ? 's' : ''} suspended
            </p>
          </div>
        )}

        {d.total === 0 && (
          <p className="text-center text-xs text-slate-400 py-2">No franchises onboarded yet.</p>
        )}
      </div>
    </div>
  );
}
