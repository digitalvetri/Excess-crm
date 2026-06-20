'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Star,
  UserPlus,
  Wallet,
  Trophy,
  MapPin,
  Award,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

import {
  useEngagementSummary,
  useLeaderboardData,
  useReferralSummary,
  useReferralList,
  useCreateReferral,
  useMarkConverted,
  useRewardReferral,
  useReviewSummary,
  useReviewList,
  useWalletData,
  useWalletTransactions,
  useCreateTransaction,
  useAmbassadors,
  useColonyClusters,
  type EngagementSummary,
  type Referral,
  type Review,
  type WalletTransaction,
  type ReviewSummary,
  type Ambassador,
  type AmbassadorTier,
  type ColonyCluster,
} from '@/hooks/use-engagement';
import { getApiErrorMessage } from '@/lib/api-error';
import { useAuth } from '@/hooks/use-auth';
import type { UserRole } from '@excess/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'leaderboard' | 'referrals' | 'ambassadors' | 'reviews' | 'wallet' | 'colony';
type ReferralStatusFilter = 'ALL' | 'PENDING' | 'CONVERTED' | 'REWARDED';
type TxTypeFilter = 'CREDIT' | 'DEBIT' | undefined;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatInr(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? '₹0' : `₹${num.toLocaleString('en-IN')}`;
}

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
        />
      ))}
    </span>
  );
}

function PulseSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: Referral['status'] }) {
  const cls: Record<Referral['status'], string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    CONVERTED: 'bg-blue-100 text-blue-800',
    REWARDED: 'bg-green-100 text-green-800',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function TxBadge({ type }: { type: 'CREDIT' | 'DEBIT' }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        type === 'CREDIT' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
      }`}
    >
      {type === 'CREDIT' ? 'Credit' : 'Debit'}
    </span>
  );
}

function medalOrRank(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `${rank}`;
}

// ─── KPI Strip ───────────────────────────────────────────────────────────────

function KpiStrip() {
  const { data, isLoading } = useEngagementSummary();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  const summary: EngagementSummary = data ?? {
    avgRating: '0.0',
    totalReviews: 0,
    referralsThisMonth: 0,
    walletBalance: '0',
    topAgent: null,
    topAgentDeals: 0,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white rounded-xl border border-border p-4 flex items-start gap-3">
        <div className="flex-shrink-0 p-2 rounded-lg bg-amber-50">
          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-800">
            {parseFloat(String(summary.avgRating)).toFixed(1)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Avg rating</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border p-4 flex items-start gap-3">
        <div className="flex-shrink-0 p-2 rounded-lg bg-blue-50">
          <UserPlus className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-800">{summary.referralsThisMonth}</p>
          <p className="text-xs text-slate-500 mt-0.5">Referrals this mo.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border p-4 flex items-start gap-3">
        <div className="flex-shrink-0 p-2 rounded-lg bg-green-50">
          <Wallet className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-800">{formatInr(summary.walletBalance)}</p>
          <p className="text-xs text-slate-500 mt-0.5">Wallet balance</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border p-4 flex items-start gap-3">
        <div className="flex-shrink-0 p-2 rounded-lg bg-primary/10">
          <Trophy className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-lg font-bold text-slate-800 leading-tight">
            {summary.topAgent ?? '—'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {summary.topAgentDeals} deals · Top agent
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

const TABS: { label: string; value: Tab }[] = [
  { label: 'Leaderboard', value: 'leaderboard' },
  { label: 'Referrals', value: 'referrals' },
  { label: 'Ambassadors', value: 'ambassadors' as Tab },
  { label: 'Reviews & NPS', value: 'reviews' },
  { label: 'Wallet', value: 'wallet' },
  { label: 'Colony Map', value: 'colony' },
];

// Which tabs each role may see. Franchise partners only get the network-facing
// tabs they have data for; the company-internal tabs (ambassadors, reviews,
// colony) stay HQ/employee-only. Wallet is owner-only (wallet.read).
function allowedTabsFor(role: UserRole | null): Tab[] {
  if (role === 'FRANCHISE_OWNER') return ['leaderboard', 'referrals', 'wallet'];
  if (role === 'FRANCHISE_USER') return ['leaderboard', 'referrals'];
  // ADMIN / EMPLOYEE (and any future internal role) see everything
  return ['leaderboard', 'referrals', 'ambassadors', 'reviews', 'wallet', 'colony'];
}

function TabBar({
  active,
  onSelect,
  tabs,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
  tabs: { label: string; value: Tab }[];
}) {
  return (
    <div className="border-b border-border">
      <div className="flex gap-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onSelect(tab.value)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
              active === tab.value
                ? 'border-b-2 border-primary text-primary'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Leaderboard Tab ─────────────────────────────────────────────────────────

function LeaderboardTab() {
  const { data, isLoading } = useLeaderboardData();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-border">
          <PulseSkeleton />
        </div>
        <div className="bg-white rounded-xl border border-border">
          <PulseSkeleton />
        </div>
      </div>
    );
  }

  const agents = data?.agents ?? [];
  const franchises = data?.franchises ?? [];
  const monthLabel = data?.monthStart
    ? format(new Date(data.monthStart), 'MMM yyyy')
    : '';

  const maxAgentLeads = agents.length > 0 ? Math.max(...agents.map((a) => a.convertedLeads)) : 1;
  const maxFranchiseComm =
    franchises.length > 0
      ? Math.max(...franchises.map((f) => parseFloat(f.commissionInr)))
      : 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Top Agents */}
      <div className="bg-white rounded-xl border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-slate-800">Top Agents</h2>
          {monthLabel && (
            <span className="text-xs text-slate-500">{monthLabel}</span>
          )}
        </div>
        {agents.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No data this month.</div>
        ) : (
          <ul className="divide-y divide-border">
            {agents.map((agent, idx) => {
              const pct = maxAgentLeads > 0 ? (agent.convertedLeads / maxAgentLeads) * 100 : 0;
              return (
                <li key={agent.userId} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-6 text-center text-sm">{medalOrRank(idx + 1)}</span>
                  <span className="flex-1 text-sm text-slate-700 truncate">{agent.name}</span>
                  <div className="flex items-center gap-2 w-32">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-600 w-6 text-right">
                      {agent.convertedLeads}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Top Franchises */}
      <div className="bg-white rounded-xl border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-slate-800">Top Franchises</h2>
          {monthLabel && (
            <span className="text-xs text-slate-500">{monthLabel}</span>
          )}
        </div>
        {franchises.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No data this month.</div>
        ) : (
          <ul className="divide-y divide-border">
            {franchises.map((fr, idx) => {
              const val = parseFloat(fr.commissionInr);
              const pct = maxFranchiseComm > 0 ? (val / maxFranchiseComm) * 100 : 0;
              return (
                <li key={fr.tenantId} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-6 text-center text-sm">{medalOrRank(idx + 1)}</span>
                  <span className="flex-1 text-sm text-slate-700 truncate">{fr.name}</span>
                  <div className="flex items-center gap-2 w-40">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-600 w-20 text-right">
                      {formatInr(fr.commissionInr)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── New Referral Modal ───────────────────────────────────────────────────────

function NewReferralModal({ onClose }: { onClose: () => void }) {
  const [referrerId, setReferrerId] = useState('');
  const [referredLeadId, setReferredLeadId] = useState('');
  const createReferral = useCreateReferral();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!referrerId.trim() || !referredLeadId.trim()) return;
    try {
      await createReferral.mutateAsync({ referrerId: referrerId.trim(), referredLeadId: referredLeadId.trim() });
      toast.success('Referral recorded');
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl border border-border w-full max-w-sm mx-4 p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-800">New Referral</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Referrer Lead ID
            </label>
            <input
              type="text"
              value={referrerId}
              onChange={(e) => setReferrerId(e.target.value)}
              placeholder="UUID"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              New Lead ID
            </label>
            <input
              type="text"
              value={referredLeadId}
              onChange={(e) => setReferredLeadId(e.target.value)}
              placeholder="UUID"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-border text-slate-600 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createReferral.isPending || !referrerId.trim() || !referredLeadId.trim()}
              className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {createReferral.isPending ? 'Saving…' : 'Record Referral'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Reward Input ─────────────────────────────────────────────────────────────

function RewardInput({ referralId, onDone }: { referralId: string; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const rewardReferral = useRewardReferral();

  async function handleSave() {
    if (!amount.trim()) return;
    try {
      await rewardReferral.mutateAsync({ id: referralId, rewardInr: Number(amount) });
      toast.success('Reward saved');
      onDone();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min="0"
        step="1"
        placeholder="₹ Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-24 border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
      />
      <button
        onClick={handleSave}
        disabled={rewardReferral.isPending || !amount.trim()}
        className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
      >
        {rewardReferral.isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

// ─── Referrals Tab ────────────────────────────────────────────────────────────

function ReferralsTab() {
  const { role } = useAuth();
  // Rewarding a referral is ADMIN-only (referrals.reward); franchise users can
  // submit + mark converted, but not reward.
  const canReward = role === 'ADMIN';
  const [statusFilter, setStatusFilter] = useState<ReferralStatusFilter>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [rewardingId, setRewardingId] = useState<string | null>(null);

  const { data: summary } = useReferralSummary();
  const { data: referrals, isLoading } = useReferralList(
    statusFilter === 'ALL' ? undefined : statusFilter,
  );
  const markConverted = useMarkConverted();

  const STATUS_TABS: { label: string; value: ReferralStatusFilter }[] = [
    { label: 'All', value: 'ALL' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Converted', value: 'CONVERTED' },
    { label: 'Rewarded', value: 'REWARDED' },
  ];

  async function handleMarkConverted(id: string) {
    try {
      await markConverted.mutateAsync(id);
      toast.success('Marked as converted');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      {showCreate && <NewReferralModal onClose={() => setShowCreate(false)} />}

      {/* Summary strip */}
      {summary && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700">
            Total: {summary.total}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
            Pending: {summary.pending}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-800">
            Converted: {summary.converted}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-800">
            Rewarded: {summary.rewarded}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-800">
            Total Reward: {formatInr(summary.totalRewardInr)}
          </span>
        </div>
      )}

      {/* Filter + Create */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setStatusFilter(t.value)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                statusFilter === t.value
                  ? 'bg-primary text-white'
                  : 'border border-border text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90"
        >
          New Referral
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-xs font-medium text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3">Referred Lead</th>
              <th className="text-left px-4 py-3">Referred By</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Reward</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-8 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : !referrals || referrals.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                  No referrals found.
                </td>
              </tr>
            ) : (
              referrals.map((referral: Referral) => (
                <tr key={referral.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-slate-800 font-medium">
                        {referral.referredLead?.name ?? '—'}
                      </span>
                      {referral.referredLead?.phone && (
                        <p className="text-xs text-slate-500">{referral.referredLead.phone}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {referral.referrer?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={referral.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {referral.rewardInr ? formatInr(referral.rewardInr) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {format(new Date(referral.createdAt), 'dd MMM yyyy')}
                  </td>
                  <td className="px-4 py-3">
                    {referral.status === 'PENDING' && (
                      <button
                        onClick={() => handleMarkConverted(referral.id)}
                        disabled={markConverted.isPending}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        Mark Converted
                      </button>
                    )}
                    {referral.status === 'CONVERTED' && canReward && (
                      rewardingId === referral.id ? (
                        <RewardInput
                          referralId={referral.id}
                          onDone={() => setRewardingId(null)}
                        />
                      ) : (
                        <button
                          onClick={() => setRewardingId(referral.id)}
                          className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Reward ₹
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Reviews & NPS Tab ────────────────────────────────────────────────────────

function RatingSummaryPanel({ summary }: { summary: ReviewSummary }) {
  const avgNum = parseFloat(String(summary.avgRating));
  const maxCount = summary.distribution.length > 0
    ? Math.max(...summary.distribution.map((d) => d.count))
    : 1;

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <div className="flex gap-8">
        {/* Left: big avg */}
        <div className="flex flex-col items-center justify-center min-w-[80px]">
          <p className="text-4xl font-bold text-slate-800">{isNaN(avgNum) ? '—' : avgNum.toFixed(1)}</p>
          <StarRating rating={avgNum} />
          <p className="text-xs text-slate-500 mt-1">{summary.totalCount} reviews</p>
        </div>

        {/* Right: distribution bars */}
        <div className="flex-1 space-y-1.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const item = summary.distribution.find((d) => d.rating === star);
            const count = item?.count ?? 0;
            const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-4 text-right">{star}</span>
                <Star className="h-3 w-3 fill-amber-400 text-amber-400 flex-shrink-0" />
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 w-5 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NpsPanel({ summary }: { summary: ReviewSummary }) {
  const nps = summary.nps;

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Net Promoter Score</h3>
      {nps.total === 0 ? (
        <div className="py-6 text-center text-sm text-slate-400">No NPS responses yet</div>
      ) : (
        <div className="space-y-3">
          <p className="text-4xl font-bold text-slate-800">
            {nps.score !== null ? nps.score : 'N/A'}
          </p>
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-800">
              Promoters {nps.promoters}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700">
              Passives {nps.passives}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-800">
              Detractors {nps.detractors}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Promoters − Detractors ÷ Total × 100
          </p>
        </div>
      )}
    </div>
  );
}

function ReviewsTab() {
  const [ratingFilter, setRatingFilter] = useState<number | undefined>(undefined);
  const { data: summary, isLoading: summaryLoading } = useReviewSummary();
  const { data: reviews, isLoading: reviewsLoading } = useReviewList(
    ratingFilter !== undefined ? { rating: ratingFilter } : undefined,
  );

  const RATING_PILLS: { label: string; value: number | undefined }[] = [
    { label: 'All', value: undefined },
    { label: '5★', value: 5 },
    { label: '4★', value: 4 },
    { label: '3★', value: 3 },
    { label: '2★', value: 2 },
    { label: '1★', value: 1 },
  ];

  return (
    <div className="space-y-5">
      {/* Rating + NPS panels */}
      {summaryLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-36 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-36 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RatingSummaryPanel summary={summary} />
          <NpsPanel summary={summary} />
        </div>
      ) : null}

      {/* Star filter */}
      <div className="flex gap-1 flex-wrap">
        {RATING_PILLS.map((pill) => (
          <button
            key={pill.label}
            onClick={() => setRatingFilter(pill.value)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              ratingFilter === pill.value
                ? 'bg-primary text-white'
                : 'border border-border text-slate-600 hover:bg-slate-50'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Reviews table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-xs font-medium text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3">Customer</th>
              <th className="text-left px-4 py-3">Rating</th>
              <th className="text-left px-4 py-3">Comment</th>
              <th className="text-left px-4 py-3">Source</th>
              <th className="text-left px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {reviewsLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-8 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : !reviews || reviews.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                  No reviews yet.
                </td>
              </tr>
            ) : (
              reviews.map((review: Review) => (
                <tr key={review.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    {review.lead?.id ? (
                      <Link
                        href={`/leads/${review.lead.id}`}
                        className="text-primary hover:underline font-medium"
                      >
                        {review.lead.name}
                      </Link>
                    ) : (
                      <span className="text-slate-600">{review.lead?.name ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StarRating rating={review.rating} />
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs">
                    {review.comment
                      ? review.comment.length > 100
                        ? `${review.comment.slice(0, 100)}…`
                        : review.comment
                      : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 capitalize">
                    {review.source.toLowerCase()}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {format(new Date(review.createdAt), 'dd MMM yyyy')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Add Transaction Modal ────────────────────────────────────────────────────

function AddTransactionModal({ onClose }: { onClose: () => void }) {
  const [txType, setTxType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const createTransaction = useCreateTransaction();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!amount.trim() || !description.trim()) return;
    try {
      const trimmedRef = referenceId.trim();
      await createTransaction.mutateAsync({
        type: txType,
        amountInr: Number(amount),
        description: description.trim(),
        ...(trimmedRef ? { referenceId: trimmedRef } : {}),
      });
      toast.success('Transaction recorded');
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl border border-border w-full max-w-sm mx-4 p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-800">Add Transaction</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type toggle */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <div className="flex gap-2">
              {(['CREDIT', 'DEBIT'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTxType(t)}
                  className={`flex-1 py-2 text-sm rounded-lg font-medium transition-colors ${
                    txType === t
                      ? t === 'CREDIT'
                        ? 'bg-green-600 text-white'
                        : 'bg-red-600 text-white'
                      : 'border border-border text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t === 'CREDIT' ? 'Credit' : 'Debit'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Amount ₹</label>
            <input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Reason for transaction"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Reference ID <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              placeholder="e.g. INV-2026-001"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-border text-slate-600 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTransaction.isPending || !amount.trim() || !description.trim()}
              className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {createTransaction.isPending ? 'Saving…' : 'Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Wallet Tab ───────────────────────────────────────────────────────────────

function WalletTab() {
  const { role } = useAuth();
  // Wallet entries are created by HQ only (wallet.write is ADMIN). Franchise
  // owners get a read-only wallet view.
  const canAddTx = role === 'ADMIN';
  const [txTypeFilter, setTxTypeFilter] = useState<TxTypeFilter>(undefined);
  const [showAddTx, setShowAddTx] = useState(false);

  const { data: walletData, isLoading: walletLoading } = useWalletData();
  const { data: transactions, isLoading: txLoading } = useWalletTransactions(txTypeFilter);

  const TX_FILTER_PILLS: { label: string; value: TxTypeFilter }[] = [
    { label: 'All', value: undefined },
    { label: 'Credits', value: 'CREDIT' },
    { label: 'Debits', value: 'DEBIT' },
  ];

  // Compute monthly credits/debits from wallet transactions
  const monthlyStats = (() => {
    if (!walletData?.transactions) return { credits: 0, debits: 0 };
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let credits = 0;
    let debits = 0;
    for (const tx of walletData.transactions) {
      const txDate = new Date(tx.createdAt);
      if (txDate >= monthStart) {
        const amt = parseFloat(tx.amountInr);
        if (tx.type === 'CREDIT') credits += amt;
        else debits += amt;
      }
    }
    return { credits, debits };
  })();

  return (
    <div className="space-y-5">
      {showAddTx && <AddTransactionModal onClose={() => setShowAddTx(false)} />}

      {/* Balance card */}
      {walletLoading ? (
        <div className="h-28 animate-pulse rounded-xl bg-slate-100" />
      ) : walletData ? (
        <div className="bg-white rounded-xl border border-border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">
              Available Balance
            </p>
            <p className="text-4xl font-bold text-slate-800">
              {formatInr(walletData.wallet.balanceInr)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Last updated: {format(new Date(walletData.wallet.updatedAt), 'dd MMM yyyy, h:mm a')}
            </p>
          </div>
          <div className="flex gap-3">
            <div className="text-center px-4 py-2 rounded-lg bg-green-50 border border-green-100">
              <p className="text-xs text-green-700 font-medium">Credits this mo.</p>
              <p className="text-sm font-bold text-green-800">
                {formatInr(monthlyStats.credits)}
              </p>
            </div>
            <div className="text-center px-4 py-2 rounded-lg bg-red-50 border border-red-100">
              <p className="text-xs text-red-700 font-medium">Debits this mo.</p>
              <p className="text-sm font-bold text-red-800">
                {formatInr(monthlyStats.debits)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Filter + Add */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1">
          {TX_FILTER_PILLS.map((pill) => (
            <button
              key={pill.label}
              onClick={() => setTxTypeFilter(pill.value)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                txTypeFilter === pill.value
                  ? 'bg-primary text-white'
                  : 'border border-border text-slate-600 hover:bg-slate-50'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
        {canAddTx && (
          <button
            onClick={() => setShowAddTx(true)}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            Add Transaction
          </button>
        )}
      </div>

      {/* Transactions table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-xs font-medium text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Description</th>
              <th className="text-left px-4 py-3">Reference</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-right px-4 py-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {txLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-8 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : !transactions || transactions.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                  No transactions yet.
                </td>
              </tr>
            ) : (
              transactions.map((tx: WalletTransaction) => (
                <tr key={tx.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {format(new Date(tx.createdAt), 'dd MMM yyyy')}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{tx.description}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {tx.referenceId ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <TxBadge type={tx.type} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium">
                    <span className={tx.type === 'CREDIT' ? 'text-green-700' : 'text-red-700'}>
                      {tx.type === 'CREDIT' ? '+' : '-'}{formatInr(tx.amountInr)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Ambassador Leaderboard Tab ───────────────────────────────────────────────

const TIER_STYLES: Record<AmbassadorTier, { badge: string; label: string }> = {
  BRONZE:   { badge: 'bg-amber-100 text-amber-800',   label: 'Bronze'   },
  SILVER:   { badge: 'bg-slate-100 text-slate-700',   label: 'Silver'   },
  GOLD:     { badge: 'bg-yellow-100 text-yellow-800', label: 'Gold'     },
  PLATINUM: { badge: 'bg-purple-100 text-purple-800', label: 'Platinum' },
};

function AmbassadorBadge({ tier }: { tier: AmbassadorTier }) {
  const s = TIER_STYLES[tier];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${s.badge}`}>
      <Award className="h-3 w-3" />
      {s.label}
    </span>
  );
}

function AmbassadorsTab() {
  const { data: ambassadors, isLoading } = useAmbassadors();

  if (isLoading) {
    return <PulseSkeleton rows={8} />;
  }

  if (!ambassadors || ambassadors.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-slate-400">
        No ambassadors yet — start recording referrals to build your community.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Customers who referred the most converted leads. Tiers: Bronze (1+), Silver (3+), Gold (5+), Platinum (10+).
        Use the Referrals tab to issue rewards.
      </p>
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-xs font-medium text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3 w-10">#</th>
              <th className="text-left px-4 py-3">Customer</th>
              <th className="text-left px-4 py-3">City</th>
              <th className="text-left px-4 py-3">Referrals</th>
              <th className="text-left px-4 py-3">Tier</th>
              <th className="text-left px-4 py-3">Lead</th>
            </tr>
          </thead>
          <tbody>
            {(ambassadors as Ambassador[]).map((a) => (
              <tr key={a.referrerId} className="border-b border-border last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-500 text-center">{medalOrRank(a.rank)}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{a.referrer?.name ?? '—'}</p>
                  {a.referrer?.phone && (
                    <p className="text-xs text-slate-400">{a.referrer.phone}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {a.referrer?.city ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <span className="font-bold text-slate-800">{a.referralCount}</span>
                </td>
                <td className="px-4 py-3">
                  <AmbassadorBadge tier={a.tier} />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/leads/${a.referrerId}`}
                    className="text-xs text-primary hover:underline"
                  >
                    View lead
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Colony Map Tab ───────────────────────────────────────────────────────────

function ColonyScoreBar({ score }: { score: number }) {
  const color =
    score >= 60 ? 'bg-green-500' :
    score >= 30 ? 'bg-amber-400' :
    'bg-slate-200';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600 w-8 text-right">{score}</span>
    </div>
  );
}

function ColonyTab() {
  const { data: clusters, isLoading } = useColonyClusters();

  if (isLoading) {
    return <PulseSkeleton rows={8} />;
  }

  if (!clusters || clusters.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-slate-400">
        No pincode data yet. Add city/pincode to leads to see colony clusters.
      </div>
    );
  }

  const stages = ['NEW', 'QUALIFIED', 'FOLLOW_UP', 'NOT_ANSWERED', 'CONVERTED', 'INVALID', 'WRONG_ENQUIRY'];

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Pincode-level heat map. Colony Score = (Converted + Qualified×0.5) ÷ Total × 100. Higher is hotter.
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-border p-3 text-center">
          <p className="text-2xl font-bold text-slate-800">{clusters.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">Pincodes active</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-3 text-center">
          <p className="text-2xl font-bold text-slate-800">
            {clusters.reduce((s, c) => s + c.total, 0)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Total leads</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-3 text-center">
          <p className="text-2xl font-bold text-green-600">
            {clusters.filter((c) => c.colonyScore >= 60).length}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Hot zones</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">
            {clusters.filter((c) => c.colonyScore < 30).length}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Cold zones</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-xs font-medium text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3">Pincode</th>
              <th className="text-left px-4 py-3">City</th>
              <th className="text-left px-4 py-3">Total</th>
              <th className="text-left px-4 py-3 min-w-[140px]">Colony Score</th>
              {stages.map((s) => (
                <th key={s} className="text-right px-2 py-3 text-xs">{s.slice(0, 3)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(clusters as ColonyCluster[]).map((c) => (
              <tr key={c.pincode} className="border-b border-border last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 font-mono text-slate-700">
                    <MapPin className="h-3 w-3 text-slate-400" />
                    {c.pincode}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{c.city ?? '—'}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{c.total}</td>
                <td className="px-4 py-3">
                  <ColonyScoreBar score={c.colonyScore} />
                </td>
                {stages.map((s) => (
                  <td key={s} className="px-2 py-3 text-right text-xs text-slate-500">
                    {c.stages[s] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Inner page (needs useSearchParams) ──────────────────────────────────────

function EngagementPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { role } = useAuth();

  const allowedTabs = allowedTabsFor(role);
  const visibleTabs = TABS.filter((t) => allowedTabs.includes(t.value));
  const isFranchise = role === 'FRANCHISE_OWNER' || role === 'FRANCHISE_USER';

  const raw = searchParams.get('tab');
  // Clamp the requested tab to those the role may see — a franchise user landing
  // on ?tab=reviews falls back to the leaderboard rather than hitting a 403 tab.
  const activeTab: Tab = allowedTabs.includes(raw as Tab) ? (raw as Tab) : allowedTabs[0]!;

  function setTab(t: Tab) {
    router.replace(`/engagement?tab=${t}`);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">
          {isFranchise ? 'Network & Rewards' : 'Engagement Hub'}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {isFranchise
            ? 'Your leaderboard standing, referrals and wallet — all in one place.'
            : 'Leaderboards, referrals, reviews and wallet — all in one place.'}
        </p>
      </div>

      {/* KPI Strip — company-wide metrics, hidden for franchise partners */}
      {!isFranchise && <KpiStrip />}

      {/* Tab bar + content */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <TabBar active={activeTab} onSelect={setTab} tabs={visibleTabs} />
        <div className="p-5">
          {activeTab === 'leaderboard' && <LeaderboardTab />}
          {activeTab === 'referrals' && <ReferralsTab />}
          {activeTab === 'ambassadors' && <AmbassadorsTab />}
          {activeTab === 'reviews' && <ReviewsTab />}
          {activeTab === 'wallet' && <WalletTab />}
          {activeTab === 'colony' && <ColonyTab />}
        </div>
      </div>
    </div>
  );
}

// ─── Default export ───────────────────────────────────────────────────────────

export default function EngagementPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Loading…</div>}>
      <EngagementPageInner />
    </Suspense>
  );
}
