'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { DollarSign, CheckCircle } from 'lucide-react';
import { useCommissions, useApproveCommission } from '@/hooks/use-franchise';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING_APPROVAL: { label: 'Pending', className: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Approved', className: 'bg-green-100 text-green-700' },
  PAID: { label: 'Paid', className: 'bg-blue-100 text-blue-700' },
  ON_HOLD: { label: 'On Hold', className: 'bg-slate-100 text-slate-600' },
  DISPUTED: { label: 'Disputed', className: 'bg-red-100 text-red-600' },
};

export default function CommissionsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const { data, isLoading } = useCommissions(statusFilter ? { status: statusFilter } : undefined);
  const approve = useApproveCommission();

  const commissions = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Commissions</h1>
          <p className="text-sm text-slate-500 mt-0.5">Review and approve franchise commissions.</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All Statuses</option>
          <option value="PENDING_APPROVAL">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="PAID">Paid</option>
          <option value="DISPUTED">Disputed</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-white rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : commissions.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <DollarSign className="mx-auto mb-3 text-slate-300" size={32} />
          <p className="text-slate-500 text-sm">No commissions found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_100px_120px_120px_100px_80px] gap-4 px-5 py-2 bg-slate-50 border-b border-border text-xs font-medium text-slate-500 uppercase tracking-wide">
            <span>Lead</span>
            <span>Deal Value</span>
            <span>Commission</span>
            <span>Net Payable</span>
            <span>Status</span>
            <span>Action</span>
          </div>
          <div className="divide-y divide-border">
            {commissions.map((c) => {
              const statusCfg = STATUS_CONFIG[c.status] ?? { label: c.status, className: 'bg-slate-100 text-slate-600' };
              return (
                <div key={c.id} className="grid grid-cols-1 md:grid-cols-[1fr_100px_120px_120px_100px_80px] gap-2 md:gap-4 px-5 py-3 items-center">
                  <div className="text-sm">
                    <p className="font-medium text-slate-800 truncate">{c.leadId.slice(0, 8)}…</p>
                    <p className="text-xs text-slate-500">{format(new Date(c.createdAt), 'dd MMM yyyy')}</p>
                  </div>
                  <p className="text-sm text-slate-700">₹{Number(c.dealValueInr).toLocaleString('en-IN')}</p>
                  <p className="text-sm text-slate-700">₹{Number(c.commissionInr).toLocaleString('en-IN')} ({c.ratePercent}%)</p>
                  <p className="text-sm font-medium text-slate-800">₹{Number(c.netPayableInr).toLocaleString('en-IN')}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${statusCfg.className}`}>
                    {statusCfg.label}
                  </span>
                  <div className="flex gap-1.5">
                    {c.status === 'PENDING_APPROVAL' && (
                      <button
                        onClick={() => approve.mutate(c.id)}
                        disabled={approve.isPending}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                        title="Approve"
                      >
                        <CheckCircle size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
