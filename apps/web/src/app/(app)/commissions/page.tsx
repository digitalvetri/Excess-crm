'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  CheckCircle,
  XCircle,
  DollarSign,
  X,
  CreditCard,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useCommissionSummary,
  useCommissions,
  useApproveCommission,
  useDisputeCommission,
  useCreatePayout,
  type CommissionStatus,
} from '@/hooks/use-franchise';
import { getApiErrorMessage } from '@/lib/api-error';
import { useCommissionProjections } from '@/hooks/use-financial';

// ─── Config ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CommissionStatus, { label: string; className: string }> = {
  PENDING_APPROVAL: { label: 'Pending',  className: 'bg-amber-100 text-amber-700' },
  APPROVED:         { label: 'Approved', className: 'bg-blue-100 text-blue-700' },
  PAID:             { label: 'Paid',     className: 'bg-green-100 text-green-700' },
  ON_HOLD:          { label: 'On Hold',  className: 'bg-slate-100 text-slate-600' },
  DISPUTED:         { label: 'Disputed', className: 'bg-red-100 text-red-600' },
};

type FilterTab = '' | CommissionStatus;

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: '',                 label: 'All' },
  { value: 'PENDING_APPROVAL', label: 'Pending' },
  { value: 'APPROVED',         label: 'Approved' },
  { value: 'PAID',             label: 'Paid' },
  { value: 'DISPUTED',         label: 'Disputed' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inr(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '₹0';
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  count,
  amount,
  className,
}: {
  label: string;
  count: number;
  amount: string;
  className: string;
}) {
  return (
    <div className={`flex-1 min-w-[180px] rounded-xl border p-4 ${className}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-xl font-bold leading-tight">{amount}</p>
      <p className="text-xs mt-0.5 opacity-60">{count} {count === 1 ? 'commission' : 'commissions'}</p>
    </div>
  );
}

// ─── Payout modal ─────────────────────────────────────────────────────────────

interface PayoutModalProps {
  commissionIds: string[];
  totalInr: number;
  onClose: () => void;
}

function PayoutModal({ commissionIds, totalInr, onClose }: PayoutModalProps) {
  const [bankUtr, setBankUtr] = useState('');
  const createPayout = useCreatePayout();

  const handleConfirm = () => {
    createPayout.mutate(
      {
        commissionIds,
        ...(bankUtr.trim() && { bankUtr: bankUtr.trim() }),
      },
      {
        onSuccess: () => {
          toast.success(`Payout of ${inr(totalInr)} created successfully.`);
          onClose();
        },
        onError: (err) => {
          toast.error(getApiErrorMessage(err, 'Failed to create payout.'));
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <CreditCard size={18} className="text-primary" />
            <h2 className="text-base font-semibold text-slate-800">Create Payout</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm text-slate-700">
            <span className="font-medium">{commissionIds.length}</span>{' '}
            {commissionIds.length === 1 ? 'commission' : 'commissions'} ·{' '}
            <span className="font-bold text-slate-900">{inr(totalInr)}</span>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Bank UTR / Reference Number{' '}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={bankUtr}
              onChange={(e) => setBankUtr(e.target.value)}
              placeholder="e.g. SBIN0001234567890"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {createPayout.isError && (
            <p className="text-xs text-red-600">
              {getApiErrorMessage(createPayout.error, 'Failed to create payout.')}
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border text-sm font-medium text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={createPayout.isPending}
              className="flex-1 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createPayout.isPending ? 'Creating…' : 'Confirm Payout'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 bg-white rounded-xl border border-border animate-pulse" />
      ))}
    </div>
  );
}

// ─── Projection banner ────────────────────────────────────────────────────────

function ProjectionBanner() {
  const { data, loading } = useCommissionProjections();
  const proj = data;

  if (loading) return <div className="h-24 rounded-2xl bg-slate-100 animate-pulse mb-6" />;
  if (!proj) return null;

  const confidenceColor =
    proj.confidence === 'high' ? 'text-green-600' :
    proj.confidence === 'medium' ? 'text-amber-600' : 'text-slate-500';

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 mb-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <TrendingUp size={18} className="text-primary" />
          30-Day Commission Projection
        </h3>
        <span className={`text-xs font-medium uppercase ${confidenceColor}`}>
          {proj.confidence} confidence
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-2xl font-bold text-primary">
            ₹{(proj.projectedCommissionInr / 100000).toFixed(1)}L
          </p>
          <p className="text-xs text-slate-500">Projected commission</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900">
            {proj.expectedConversions.toFixed(1)}
          </p>
          <p className="text-xs text-slate-500">Expected conversions</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900">
            {proj.avgRatePercent.toFixed(1)}%
          </p>
          <p className="text-xs text-slate-500">Avg commission rate</p>
        </div>
      </div>
      <div className="flex gap-4 mt-3 text-xs text-slate-500">
        <span>{proj.pipeline.qualified} Qualified</span>
        <span>{proj.pipeline.followUp} Follow-up</span>
        <span>{proj.pipeline.new} New</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommissionsPage() {
  const [activeTab, setActiveTab]         = useState<FilterTab>('');
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [showPayoutModal, setShowPayoutModal] = useState(false);

  const summaryQuery   = useCommissionSummary();
  const commissionsQuery = useCommissions(activeTab ? { status: activeTab } : undefined);
  const approve        = useApproveCommission();
  const dispute        = useDisputeCommission();

  const commissions = useMemo(() => commissionsQuery.data?.commissions ?? [], [commissionsQuery.data?.commissions]);
  const summary     = summaryQuery.data;

  // Only APPROVED commissions can be selected for batch payout
  const approvedCommissions = useMemo(
    () => commissions.filter((c) => c.status === 'APPROVED'),
    [commissions],
  );

  const selectedApproved = useMemo(
    () => approvedCommissions.filter((c) => selectedIds.has(c.id)),
    [approvedCommissions, selectedIds],
  );

  const batchTotal = useMemo(
    () => selectedApproved.reduce((sum, c) => sum + Number(c.netPayableInr), 0),
    [selectedApproved],
  );

  const pendingCount = summary?.pendingCount ?? 0;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedApproved.length === approvedCommissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(approvedCommissions.map((c) => c.id)));
    }
  };

  const handleApprove = (id: string) => {
    approve.mutate(id, {
      onSuccess: () => toast.success('Commission approved.'),
      onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to approve.')),
    });
  };

  const handleDispute = (id: string) => {
    dispute.mutate(id, {
      onSuccess: () => toast.success('Commission marked as disputed.'),
      onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to dispute.')),
    });
  };

  return (
    <div className="space-y-6">
      {/* ── Header + KPI cards ── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Commissions</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Review, approve and pay out franchise commissions.
        </p>
      </div>

      <ProjectionBanner />

      {/* KPI strip */}
      {summary ? (
        <div className="flex flex-wrap gap-3">
          <KpiCard
            label="Pending Approval"
            count={summary.pendingCount}
            amount={inr(summary.pendingInr)}
            className="bg-amber-50 border-amber-200 text-amber-700"
          />
          <KpiCard
            label="Approved"
            count={summary.approvedCount}
            amount={inr(summary.approvedInr)}
            className="bg-blue-50 border-blue-200 text-blue-700"
          />
          <KpiCard
            label="Paid"
            count={summary.paidCount}
            amount={inr(summary.paidInr)}
            className="bg-green-50 border-green-200 text-green-700"
          />
        </div>
      ) : summaryQuery.isLoading ? null : null}

      {/* ── Filter tab pills ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTER_TABS.map((tab) => {
          const isActive = activeTab === tab.value;
          const showBadge = tab.value === 'PENDING_APPROVAL' && pendingCount > 0;
          return (
            <button
              key={tab.value}
              onClick={() => {
                setActiveTab(tab.value);
                setSelectedIds(new Set());
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-white'
                  : 'bg-white border border-border text-slate-600 hover:border-primary/40'
              }`}
            >
              {tab.label}
              {showBadge && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full font-semibold leading-none ${
                    isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Batch action bar ── */}
      {selectedApproved.length > 0 && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
          <p className="text-sm text-slate-700">
            <span className="font-semibold">{selectedApproved.length}</span>{' '}
            {selectedApproved.length === 1 ? 'commission' : 'commissions'} selected ·{' '}
            <span className="font-bold text-slate-900">{inr(batchTotal)}</span> total
          </p>
          <button
            onClick={() => setShowPayoutModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <CreditCard size={14} />
            Create Payout
          </button>
        </div>
      )}

      {/* ── Table ── */}
      {commissionsQuery.isLoading ? (
        <TableSkeleton />
      ) : commissions.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-14 text-center">
          <DollarSign className="mx-auto mb-3 text-slate-300" size={36} />
          <p className="text-slate-500 text-sm font-medium">
            {activeTab
              ? `No ${STATUS_CONFIG[activeTab as CommissionStatus]?.label ?? activeTab} commissions found.`
              : 'No commissions found.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {/* Table header */}
          <div className="hidden lg:grid grid-cols-[32px_1fr_160px_110px_140px_120px_110px_80px] gap-3 px-5 py-2.5 bg-slate-50 border-b border-border text-xs font-medium text-slate-500 uppercase tracking-wide">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={
                  approvedCommissions.length > 0 &&
                  selectedApproved.length === approvedCommissions.length
                }
                onChange={toggleSelectAll}
                className="rounded border-slate-300 text-primary focus:ring-primary/30"
                aria-label="Select all approved commissions"
              />
            </div>
            <span>Lead</span>
            <span>Franchise</span>
            <span>Deal Value</span>
            <span>Commission</span>
            <span>Net Payable</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {/* Table rows */}
          <div className="divide-y divide-border">
            {commissions.map((c) => {
              const statusCfg =
                STATUS_CONFIG[c.status] ??
                { label: c.status, className: 'bg-slate-100 text-slate-600' };
              const isApproved   = c.status === 'APPROVED';
              const isPending    = c.status === 'PENDING_APPROVAL';
              const isChecked    = selectedIds.has(c.id);

              const leadDisplay  = c.leadName ?? `${c.leadId.slice(0, 8)}…`;
              const franchiseDisplay = c.franchiseName ?? `${c.tenantId.slice(0, 8)}…`;

              return (
                <div
                  key={c.id}
                  className={`grid grid-cols-1 lg:grid-cols-[32px_1fr_160px_110px_140px_120px_110px_80px] gap-3 px-5 py-3.5 items-center hover:bg-slate-50/60 transition-colors ${
                    isChecked ? 'bg-primary/5' : ''
                  }`}
                >
                  {/* Checkbox — only APPROVED rows */}
                  <div className="hidden lg:flex items-center">
                    {isApproved ? (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(c.id)}
                        className="rounded border-slate-300 text-primary focus:ring-primary/30"
                        aria-label={`Select commission for ${leadDisplay}`}
                      />
                    ) : (
                      <span />
                    )}
                  </div>

                  {/* Lead */}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{leadDisplay}</p>
                    {c.leadPhone && (
                      <p className="text-xs text-slate-500 mt-0.5">{c.leadPhone}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5 lg:hidden">
                      {format(new Date(c.createdAt), 'dd MMM yyyy')}
                    </p>
                  </div>

                  {/* Franchise */}
                  <p className="text-sm text-slate-700 truncate">{franchiseDisplay}</p>

                  {/* Deal Value */}
                  <p className="text-sm text-slate-700">
                    {inr(c.dealValueInr)}
                  </p>

                  {/* Commission */}
                  <p className="text-sm text-slate-700">
                    {inr(c.commissionInr)}{' '}
                    <span className="text-xs text-slate-400">({c.ratePercent}%)</span>
                  </p>

                  {/* Net Payable */}
                  <p className="text-sm font-bold text-slate-900">
                    {inr(c.netPayableInr)}
                  </p>

                  {/* Status */}
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium w-fit ${statusCfg.className}`}
                  >
                    {statusCfg.label}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    {isPending && (
                      <>
                        <button
                          onClick={() => handleApprove(c.id)}
                          disabled={approve.isPending}
                          title="Approve"
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <CheckCircle size={16} />
                        </button>
                        <button
                          onClick={() => handleDispute(c.id)}
                          disabled={dispute.isPending}
                          title="Dispute"
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <XCircle size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Payout modal ── */}
      {showPayoutModal && (
        <PayoutModal
          commissionIds={[...selectedIds]}
          totalInr={batchTotal}
          onClose={() => {
            setShowPayoutModal(false);
            setSelectedIds(new Set());
          }}
        />
      )}
    </div>
  );
}
