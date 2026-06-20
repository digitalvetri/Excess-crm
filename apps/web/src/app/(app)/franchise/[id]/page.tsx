'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Building2,
  TrendingUp,
  Users,
  DollarSign,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  Banknote,
  AlertTriangle,
  UserPlus,
  Mail,
  Phone,
  Shield,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import {
  useFranchise,
  useFranchiseStats,
  useFranchiseAction,
  useUpdateFranchise,
  useCommissions,
  useCreateCommission,
  useApproveCommission,
  useDisputeCommission,
  usePayouts,
  useCreatePayout,
  useFranchiseAgents,
  useInviteAgent,
  useUpdateAgent,
  type FranchiseTier,
  type Commission,
  type FranchiseAgentRole,
} from '@/hooks/use-franchise';
import { getApiErrorMessage } from '@/lib/api-error';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ONBOARDING: { label: 'Onboarding', className: 'bg-blue-100 text-blue-700' },
  ACTIVE: { label: 'Active', className: 'bg-green-100 text-green-700' },
  PROBATION: { label: 'Probation', className: 'bg-amber-100 text-amber-700' },
  SUSPENDED: { label: 'Suspended', className: 'bg-orange-100 text-orange-700' },
  TERMINATED: { label: 'Terminated', className: 'bg-red-100 text-red-600' },
};

const COMMISSION_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING_APPROVAL: { label: 'Pending', className: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Approved', className: 'bg-green-100 text-green-700' },
  PAID: { label: 'Paid', className: 'bg-blue-100 text-blue-700' },
  ON_HOLD: { label: 'On Hold', className: 'bg-slate-100 text-slate-600' },
  DISPUTED: { label: 'Disputed', className: 'bg-red-100 text-red-600' },
};

const TIERS: FranchiseTier[] = ['BRONZE', 'SILVER', 'GOLD'];

type Tab = 'overview' | 'commissions' | 'payouts' | 'team' | 'settings';

const AGENT_ROLE_CONFIG: Record<FranchiseAgentRole, { label: string; className: string }> = {
  OWNER:    { label: 'Owner',    className: 'bg-amber-100 text-amber-700' },
  SALES:    { label: 'Sales',    className: 'bg-blue-100 text-blue-700' },
  SURVEY:   { label: 'Survey',   className: 'bg-purple-100 text-purple-700' },
  FOLLOWUP: { label: 'Follow-up', className: 'bg-green-100 text-green-700' },
};

// ─── Slab row type ────────────────────────────────────────────────────────────

interface SlabRow {
  threshold: string;
  rate: string;
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function CommissionBadge({ status }: { status: string }) {
  const cfg = COMMISSION_STATUS_CONFIG[status] ?? { label: status, className: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium transition-colors ${
        active
          ? 'border-b-2 border-primary text-primary'
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Add Commission Modal ─────────────────────────────────────────────────────

function AddCommissionModal({
  franchiseId,
  onClose,
}: {
  franchiseId: string;
  onClose: () => void;
}) {
  const [leadId, setLeadId] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [ratePercent, setRatePercent] = useState('');
  const [gstInr, setGstInr] = useState('');
  const create = useCreateCommission();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leadId.trim() || !dealValue || !ratePercent) return;
    try {
      await create.mutateAsync({
        leadId: leadId.trim(),
        dealValueInr: Number(dealValue),
        ratePercent: Number(ratePercent),
        ...(gstInr ? { gstInr: Number(gstInr) } : {}),
      });
      toast.success('Commission created');
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to create commission'));
    }
  }

  // franchiseId used for future API param expansion; kept for clarity
  void franchiseId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Add Commission</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Lead ID</label>
            <input
              type="text"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              required
              placeholder="Lead UUID"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Deal Value (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Rate (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={ratePercent}
                onChange={(e) => setRatePercent(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">GST Amount (₹) — optional</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={gstInr}
              onChange={(e) => setGstInr(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {create.isPending ? 'Saving…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Create Payout Modal (inline) ─────────────────────────────────────────────

function CreatePayoutModal({
  franchiseId,
  approvedCommissions,
  onClose,
}: {
  franchiseId: string;
  approvedCommissions: Commission[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bankUtr, setBankUtr] = useState('');
  const createPayout = useCreatePayout();

  // franchiseId is available for future filtering needs
  void franchiseId;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedCommissions = approvedCommissions.filter((c) => selected.has(c.id));
  const runningTotal = selectedCommissions.reduce((sum, c) => sum + Number(c.netPayableInr), 0);

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
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Create Payout</h2>

        {approvedCommissions.length === 0 ? (
          <p className="text-sm text-slate-500">No approved commissions available.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {approvedCommissions.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
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

        <div className="flex items-center justify-between px-1">
          <span className="text-sm text-slate-500">Running total</span>
          <span className="text-base font-bold text-slate-900">
            ₹{runningTotal.toLocaleString('en-IN')}
          </span>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Bank UTR — optional</label>
          <input
            type="text"
            value={bankUtr}
            onChange={(e) => setBankUtr(e.target.value)}
            placeholder="UTR reference number"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={createPayout.isPending || selected.size === 0}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {createPayout.isPending ? 'Processing…' : 'Confirm Payout'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({
  id,
  onTabChange,
}: {
  id: string;
  onTabChange: (tab: Tab) => void;
}) {
  const { data: franchise, isLoading } = useFranchise(id);
  const { data: stats } = useFranchiseStats(id);
  const action = useFranchiseAction();
  const { data: commissionsData } = useCommissions({ franchiseId: id });
  const recentCommissions = (commissionsData?.commissions ?? []).slice(0, 5);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-white rounded-xl border border-border animate-pulse" />
        ))}
      </div>
    );
  }

  if (!franchise) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 text-center">
        <p className="text-sm text-slate-500">Franchise not found.</p>
      </div>
    );
  }

  const statusCfg =
    STATUS_CONFIG[franchise.status] ?? { label: franchise.status, className: 'bg-slate-100 text-slate-600' };

  function handleAction(act: 'activate' | 'suspend' | 'terminate' | 'probation') {
    if (act === 'terminate') {
      if (!confirm('Terminate this franchise? This cannot be undone.')) return;
    }
    action.mutate(
      { id, action: act },
      {
        onSuccess: () => toast.success(`Franchise ${act}d`),
        onError: (err) => toast.error(getApiErrorMessage(err, `Failed to ${act} franchise`)),
      },
    );
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Building2 size={24} className="text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{franchise.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.className}`}>
                  {statusCfg.label}
                </span>
                {franchise.tier && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 border border-amber-200">
                    {franchise.tier.charAt(0) + franchise.tier.slice(1).toLowerCase()}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {franchise.status === 'ONBOARDING' && (
              <button
                onClick={() => handleAction('activate')}
                disabled={action.isPending}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                Activate
              </button>
            )}
            {franchise.status === 'ACTIVE' && (
              <button
                onClick={() => handleAction('probation')}
                disabled={action.isPending}
                className="px-4 py-2 bg-amber-100 text-amber-800 text-sm font-medium rounded-lg hover:bg-amber-200 disabled:opacity-50 transition-colors"
              >
                Place on probation
              </button>
            )}
            {franchise.status === 'ACTIVE' && (
              <button
                onClick={() => handleAction('suspend')}
                disabled={action.isPending}
                className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                Suspend
              </button>
            )}
            {franchise.status === 'PROBATION' && (
              <button
                onClick={() => handleAction('activate')}
                disabled={action.isPending}
                className="px-4 py-2 bg-success text-white text-sm font-medium rounded-lg hover:bg-success/90 disabled:opacity-50 transition-colors"
              >
                Restore to active
              </button>
            )}
            {franchise.status !== 'TERMINATED' && (
              <button
                onClick={() => handleAction('terminate')}
                disabled={action.isPending}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Terminate
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI stat cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Leads', value: stats.totalLeads.toLocaleString('en-IN'), icon: TrendingUp },
            { label: 'Converted', value: stats.convertedLeads.toLocaleString('en-IN'), icon: Users },
            { label: 'Conversion Rate', value: `${stats.conversionRate}%`, icon: TrendingUp },
            {
              label: 'Commission Earned',
              value: `₹${Number(stats.totalEarnedInr).toLocaleString('en-IN')}`,
              icon: DollarSign,
            },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white rounded-xl border border-border p-5">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className="text-slate-400" />
                <p className="text-xs text-slate-500">{label}</p>
              </div>
              <p className="text-xl font-bold text-slate-800">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* 2-column info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact details */}
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Contact Details</h3>
          <dl className="space-y-2 text-sm">
            {[
              { label: 'Name', value: franchise.contactName },
              { label: 'Email', value: franchise.contactEmail },
              { label: 'Phone', value: franchise.contactPhone },
              { label: 'GST', value: franchise.gstNumber },
            ].map(({ label, value }) =>
              value ? (
                <div key={label} className="flex gap-3">
                  <dt className="w-12 shrink-0 text-slate-500">{label}</dt>
                  <dd className="text-slate-800 break-all">{value}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </div>

        {/* Performance */}
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Performance</h3>
          {stats ? (
            <dl className="space-y-2 text-sm">
              {[
                { label: 'Total Commissions', value: stats.totalCommissions.toLocaleString('en-IN') },
                {
                  label: 'Pending approval',
                  value: `${Number(stats.pendingCommissions).toLocaleString('en-IN')} commission${Number(stats.pendingCommissions) === 1 ? '' : 's'}`,
                },
                {
                  label: 'Total Earned',
                  value: `₹${Number(stats.totalEarnedInr).toLocaleString('en-IN')}`,
                },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-3">
                  <dt className="w-32 shrink-0 text-slate-500">{label}</dt>
                  <dd className="font-medium text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-slate-400">Loading stats…</p>
          )}
        </div>
      </div>

      {/* Recent commissions mini-table */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Recent Commissions</h3>
          <button
            onClick={() => onTabChange('commissions')}
            className="text-xs text-primary hover:underline"
          >
            View all →
          </button>
        </div>

        {recentCommissions.length === 0 ? (
          <p className="text-sm text-slate-400">No commissions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Lead', 'Deal Value', 'Status', 'Date'].map((col) => (
                    <th
                      key={col}
                      className="pb-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide pr-4 last:pr-0"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentCommissions.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-4 text-slate-800 truncate max-w-[140px]">
                      {c.leadName ?? c.leadId.slice(0, 8) + '…'}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      ₹{Number(c.dealValueInr).toLocaleString('en-IN')}
                    </td>
                    <td className="py-2 pr-4">
                      <CommissionBadge status={c.status} />
                    </td>
                    <td className="py-2 text-slate-500">
                      {format(new Date(c.createdAt), 'dd MMM yyyy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Commissions ─────────────────────────────────────────────────────────

function CommissionsTab({ id }: { id: string }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const { data, isLoading } = useCommissions({ franchiseId: id });
  const commissions = data?.commissions ?? [];
  const approve = useApproveCommission();
  const dispute = useDisputeCommission();

  const approvedCommissions = commissions.filter((c) => c.status === 'APPROVED');

  function handleApprove(commissionId: string) {
    approve.mutate(commissionId, {
      onSuccess: () => toast.success('Commission approved'),
      onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to approve')),
    });
  }

  function handleDispute(commissionId: string) {
    dispute.mutate(commissionId, {
      onSuccess: () => toast.success('Commission disputed'),
      onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to dispute')),
    });
  }

  return (
    <div className="space-y-4">
      {showAddModal && (
        <AddCommissionModal franchiseId={id} onClose={() => setShowAddModal(false)} />
      )}
      {showPayoutModal && (
        <CreatePayoutModal
          franchiseId={id}
          approvedCommissions={approvedCommissions}
          onClose={() => setShowPayoutModal(false)}
        />
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-700">Commissions</h3>
        <div className="flex gap-2">
          {approvedCommissions.length > 0 && (
            <button
              onClick={() => setShowPayoutModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors font-medium"
            >
              <Banknote size={14} />
              Create Payout
            </button>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors font-medium"
          >
            <Plus size={14} />
            Add Commission
          </button>
        </div>
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
          <p className="text-slate-500 text-sm">No commissions recorded yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_110px_140px_120px_110px_80px] gap-4 px-5 py-2 bg-slate-50 border-b border-border text-xs font-medium text-slate-500 uppercase tracking-wide">
            <span>Lead</span>
            <span>Deal Value</span>
            <span>Commission (Rate)</span>
            <span>Net Payable</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          <div className="divide-y divide-border">
            {commissions.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-1 md:grid-cols-[1fr_110px_140px_120px_110px_80px] gap-2 md:gap-4 px-5 py-3 items-center"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {c.leadName ?? c.leadId.slice(0, 12) + '…'}
                  </p>
                  <p className="text-xs text-slate-500">{format(new Date(c.createdAt), 'dd MMM yyyy')}</p>
                </div>
                <p className="text-sm text-slate-700">
                  ₹{Number(c.dealValueInr).toLocaleString('en-IN')}
                </p>
                <p className="text-sm text-slate-700">
                  ₹{Number(c.commissionInr).toLocaleString('en-IN')} ({c.ratePercent}%)
                </p>
                <p className="text-sm font-medium text-slate-800">
                  ₹{Number(c.netPayableInr).toLocaleString('en-IN')}
                </p>
                <CommissionBadge status={c.status} />
                <div className="flex gap-1.5">
                  {c.status === 'PENDING_APPROVAL' && (
                    <>
                      <button
                        onClick={() => handleApprove(c.id)}
                        disabled={approve.isPending}
                        title="Approve"
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                      >
                        <CheckCircle size={16} />
                      </button>
                      <button
                        onClick={() => handleDispute(c.id)}
                        disabled={dispute.isPending}
                        title="Dispute"
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                      >
                        <XCircle size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Payouts ─────────────────────────────────────────────────────────────

function PayoutsTab({ id }: { id: string }) {
  const [showModal, setShowModal] = useState(false);
  const { data, isLoading } = usePayouts({ franchiseId: id });
  const payouts = data?.payouts ?? [];
  const { data: commissionsData } = useCommissions({ franchiseId: id, status: 'APPROVED' });
  const approvedCommissions = commissionsData?.commissions ?? [];

  return (
    <div className="space-y-4">
      {showModal && (
        <CreatePayoutModal
          franchiseId={id}
          approvedCommissions={approvedCommissions}
          onClose={() => setShowModal(false)}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-700">Payout History</h3>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors font-medium"
        >
          <Plus size={14} />
          Create Payout
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
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
              <div
                key={p.id}
                className="grid grid-cols-1 md:grid-cols-[1fr_160px_140px_100px] gap-2 md:gap-4 px-5 py-3 items-center"
              >
                <div>
                  <p className="text-sm font-mono text-slate-700">{p.id.slice(0, 12)}…</p>
                  {p.bankUtr && (
                    <p className="text-xs text-slate-500 mt-0.5">UTR: {p.bankUtr}</p>
                  )}
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  ₹{Number(p.amountInr).toLocaleString('en-IN')}
                </p>
                <p className="text-sm text-slate-600">
                  {format(new Date(p.paidAt), 'dd MMM yyyy')}
                </p>
                <p className="text-sm text-slate-500">{p.commissionIds.length} commissions</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Settings ────────────────────────────────────────────────────────────

function SettingsTab({ id }: { id: string }) {
  const { data: franchise } = useFranchise(id);
  const updateFranchise = useUpdateFranchise();

  const [name, setName] = useState('');
  const [tier, setTier] = useState<FranchiseTier | ''>('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [slabs, setSlabs] = useState<SlabRow[]>([{ threshold: '0', rate: '' }]);

  // Initialise form when data arrives
  useEffect(() => {
    if (!franchise) return;
    setName(franchise.name ?? '');
    setTier(franchise.tier ?? '');
    setContactName(franchise.contactName ?? '');
    setContactEmail(franchise.contactEmail ?? '');
    setContactPhone(franchise.contactPhone ?? '');
    setGstNumber(franchise.gstNumber ?? '');
    const bank = franchise.bankAccount ?? {};
    setAccountName(bank['accountName'] ?? '');
    setAccountNumber(bank['accountNumber'] ?? '');
    setIfsc(bank['ifsc'] ?? '');
    const rawSlabs = franchise.commissionSlabs ?? {};
    const parsed = Object.entries(rawSlabs).map(([t, r]) => ({
      threshold: t,
      rate: String(r),
    }));
    setSlabs(parsed.length > 0 ? parsed : [{ threshold: '0', rate: '' }]);
  }, [franchise]);

  function addSlab() {
    setSlabs((prev) => [...prev, { threshold: '', rate: '' }]);
  }

  function removeSlab(index: number) {
    setSlabs((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSlab(index: number, field: 'threshold' | 'rate', value: string) {
    setSlabs((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const commissionSlabs: Record<string, number> = {};
    for (const slab of slabs) {
      if (slab.threshold !== '' && slab.rate !== '') {
        commissionSlabs[slab.threshold] = Number(slab.rate);
      }
    }

    const bankAccount: Record<string, string> = {};
    if (accountName) bankAccount['accountName'] = accountName;
    if (accountNumber) bankAccount['accountNumber'] = accountNumber;
    if (ifsc) bankAccount['ifsc'] = ifsc;

    try {
      await updateFranchise.mutateAsync({
        id,
        data: {
          ...(name               && { name }),
          ...(tier               && { tier: tier as import('@/hooks/use-franchise').FranchiseTier }),
          ...(contactName        && { contactName }),
          ...(contactEmail       && { contactEmail }),
          ...(contactPhone       && { contactPhone }),
          ...(gstNumber          && { gstNumber }),
          ...(Object.keys(commissionSlabs).length > 0 && { commissionSlabs }),
          ...(Object.keys(bankAccount).length > 0     && { bankAccount }),
        },
      });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save settings'));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Business */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Business</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tier</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as FranchiseTier | '')}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            >
              <option value="">— None —</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Contact</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Contact Name</label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">GST Number</label>
            <input
              type="text"
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      </div>

      {/* Bank Account */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Bank Account</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Account Name</label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Account Number</label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">IFSC</label>
            <input
              type="text"
              value={ifsc}
              onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Commission Slabs */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Commission Slabs</h3>
          <button
            type="button"
            onClick={addSlab}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus size={12} />
            Add Slab
          </button>
        </div>
        <div className="space-y-2">
          {slabs.map((slab, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">Threshold (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={slab.threshold}
                  onChange={(e) => updateSlab(index, 'threshold', e.target.value)}
                  placeholder="e.g. 500000"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={slab.rate}
                  onChange={(e) => updateSlab(index, 'rate', e.target.value)}
                  placeholder="e.g. 15"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <button
                type="button"
                onClick={() => removeSlab(index)}
                disabled={slabs.length === 1}
                className="mt-5 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-30"
                title="Remove slab"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          e.g. threshold 0 = base rate, threshold 500000 = rate for deals ≥ ₹5 lakh
        </p>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={updateFranchise.isPending}
          className="px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {updateFranchise.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

// ─── Tab: Team ────────────────────────────────────────────────────────────────

function TeamTab({ id }: { id: string }) {
  const { data, isLoading } = useFranchiseAgents(id);
  const invite             = useInviteAgent(id);
  const updateAgent        = useUpdateAgent(id);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', agentRole: 'SALES' as FranchiseAgentRole });

  const agents        = data?.agents        ?? [];
  const pendingInvites = data?.pendingInvites ?? [];

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    try {
      await invite.mutateAsync(inviteForm);
      toast.success(`Invite sent to ${inviteForm.email}`);
      setShowInvite(false);
      setInviteForm({ email: '', name: '', agentRole: 'SALES' });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to send invite'));
    }
  }

  async function handleToggleActive(userId: string, current: boolean) {
    try {
      await updateAgent.mutateAsync({ userId, data: { isActive: !current } });
      toast.success(current ? 'Agent deactivated' : 'Agent reactivated');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update agent'));
    }
  }

  async function handleRoleChange(userId: string, agentRole: FranchiseAgentRole) {
    try {
      await updateAgent.mutateAsync({ userId, data: { agentRole } });
      toast.success('Agent role updated');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update role'));
    }
  }

  return (
    <div className="space-y-5">
      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <UserPlus size={18} className="text-primary" />
              Invite Agent
            </h2>
            <form onSubmit={handleInvite} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Agent's full name"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="agent@email.com"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
                <div className="flex gap-2 flex-wrap">
                  {(Object.keys(AGENT_ROLE_CONFIG) as FranchiseAgentRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setInviteForm((p) => ({ ...p, agentRole: r }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        inviteForm.agentRole === r
                          ? 'border-primary bg-primary text-white'
                          : 'border-border text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {AGENT_ROLE_CONFIG[r].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="flex-1 px-4 py-2 border border-border text-sm rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={invite.isPending}
                  className="flex-1 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60"
                >
                  {invite.isPending ? 'Sending…' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Team Members</h3>
          <p className="text-xs text-slate-500 mt-0.5">{agents.length} active · {pendingInvites.length} pending invite{pendingInvites.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors font-medium"
        >
          <UserPlus size={14} />
          Invite Agent
        </button>
      </div>

      {/* Agent cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-white rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : agents.length === 0 && pendingInvites.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <Users className="mx-auto mb-3 text-slate-300" size={32} />
          <p className="text-slate-500 text-sm">No agents yet. Invite your first team member.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {agents.map((agent) => {
            const roleCfg = agent.agentRole ? AGENT_ROLE_CONFIG[agent.agentRole] : null;
            return (
              <div
                key={agent.id}
                className={`bg-white rounded-xl border border-border p-4 space-y-3 transition-opacity ${!agent.isActive ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800 truncate">{agent.name}</p>
                      {/* Editable role — admin can reassign an agent's role */}
                      <select
                        value={agent.agentRole ?? ''}
                        onChange={(e) => void handleRoleChange(agent.id, e.target.value as FranchiseAgentRole)}
                        disabled={updateAgent.isPending}
                        aria-label={`Role for ${agent.name}`}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary ${roleCfg?.className ?? 'bg-slate-100 text-slate-600'}`}
                      >
                        {(Object.keys(AGENT_ROLE_CONFIG) as FranchiseAgentRole[]).map((r) => (
                          <option key={r} value={r}>{AGENT_ROLE_CONFIG[r].label}</option>
                        ))}
                      </select>
                      {!agent.isActive && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Mail size={11} className="text-slate-400 flex-shrink-0" />
                      <p className="text-xs text-slate-500 truncate">{agent.email}</p>
                    </div>
                    {agent.phone && (
                      <div className="flex items-center gap-1">
                        <Phone size={11} className="text-slate-400 flex-shrink-0" />
                        <p className="text-xs text-slate-500">{agent.phone}</p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => void handleToggleActive(agent.id, agent.isActive)}
                    title={agent.isActive ? 'Deactivate agent' : 'Reactivate agent'}
                    className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                  >
                    {agent.isActive ? <ToggleRight size={20} className="text-green-500" /> : <ToggleLeft size={20} />}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border">
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-800">{agent.leadsThisMonth}</p>
                    <p className="text-xs text-slate-500">Leads (mo.)</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-800">{agent.splitsCount}</p>
                    <p className="text-xs text-slate-500">Deals</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-800">₹{agent.totalEarnedInr.toLocaleString('en-IN')}</p>
                    <p className="text-xs text-slate-500">Earned</p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pending invites */}
          {pendingInvites.map((inv) => {
            const roleCfg = AGENT_ROLE_CONFIG[inv.agentRole];
            return (
              <div key={inv.id} className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-slate-400" />
                  <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Pending Invite</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleCfg.className}`}>{roleCfg.label}</span>
                </div>
                <p className="text-sm font-medium text-slate-700">{inv.name}</p>
                <p className="text-xs text-slate-500">{inv.email}</p>
                <p className="text-xs text-slate-400">Expires {format(new Date(inv.expiresAt), 'dd MMM yyyy')}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FranchiseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const { data: franchise, isLoading, isError } = useFranchise(id);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview',    label: 'Overview' },
    { key: 'commissions', label: 'Commissions' },
    { key: 'payouts',     label: 'Payouts' },
    { key: 'team',        label: 'Team' },
    { key: 'settings',    label: 'Settings' },
  ];

  // Whole-page not-found guard so we don't render tabs (and fire their queries)
  // for a franchise that doesn't exist.
  if (!isLoading && (isError || !franchise)) {
    return (
      <div className="rounded-xl border border-border bg-white p-12 text-center">
        <Building2 className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="text-sm font-semibold text-slate-700">Franchise not found</p>
        <p className="mt-1 text-xs text-slate-400">It may have been removed, or the link is incorrect.</p>
        <Link href="/franchise" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          ← Back to Franchise Network
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-slate-800">
          {franchise?.name ?? 'Franchise'}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage this franchise workspace — commissions, payouts, and settings.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border mb-6">
        {tabs.map(({ key, label }) => (
          <TabButton key={key} active={activeTab === key} onClick={() => setActiveTab(key)}>
            {label}
          </TabButton>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab id={id} onTabChange={setActiveTab} />
      )}
      {activeTab === 'commissions' && <CommissionsTab id={id} />}
      {activeTab === 'payouts'     && <PayoutsTab     id={id} />}
      {activeTab === 'team'        && <TeamTab         id={id} />}
      {activeTab === 'settings'    && <SettingsTab     id={id} />}
    </div>
  );
}
