'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  useLeaderboard,
  type LeaderboardEntry,
  type FranchiseTier,
  type FranchiseStatus,
} from '@/hooks/use-franchise';

type Period = 'month' | 'quarter' | 'year';

const PERIOD_LABELS: Record<Period, string> = {
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
};

const MEDAL_EMOJI = ['🥇', '🥈', '🥉'];

const MEDAL_BORDER: Record<number, string> = {
  0: 'border-l-4 border-l-amber-400',
  1: 'border-l-4 border-l-slate-400',
  2: 'border-l-4 border-l-orange-400',
};

const PODIUM_RING: Record<number, string> = {
  0: 'ring-2 ring-amber-400',
  1: 'ring-2 ring-slate-400',
  2: 'ring-2 ring-orange-400',
};

const TIER_BADGE: Record<FranchiseTier, string> = {
  GOLD:   'bg-amber-100 text-amber-700 border border-amber-300',
  SILVER: 'bg-slate-100 text-slate-600 border border-slate-300',
  BRONZE: 'bg-orange-100 text-orange-700 border border-orange-300',
};

const STATUS_BADGE: Record<FranchiseStatus, string> = {
  ACTIVE:     'bg-green-100 text-green-700',
  ONBOARDING: 'bg-blue-100 text-blue-700',
  PROBATION:  'bg-amber-100 text-amber-700',
  SUSPENDED:  'bg-red-100 text-red-700',
  TERMINATED: 'bg-slate-100 text-slate-500',
};

const STATUS_LABEL: Record<FranchiseStatus, string> = {
  ACTIVE:     'Active',
  ONBOARDING: 'Onboarding',
  PROBATION:  'Probation',
  SUSPENDED:  'Suspended',
  TERMINATED: 'Terminated',
};

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function TierBadge({ tier }: { tier: FranchiseTier | null }) {
  if (!tier) return null;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIER_BADGE[tier]}`}>
      {tier.charAt(0) + tier.slice(1).toLowerCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: FranchiseStatus }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function PodiumCard({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const idx = rank - 1;
  return (
    <div
      className={`flex flex-col items-center bg-white rounded-2xl border border-slate-200 p-5 shadow-sm ${PODIUM_RING[idx] ?? ''}`}
    >
      <span className="text-4xl mb-2">{MEDAL_EMOJI[idx]}</span>
      <span className="text-xs font-semibold text-slate-400 tracking-widest uppercase mb-1">
        #{rank}
      </span>
      <p className="text-lg font-bold text-slate-900 text-center leading-tight">
        {entry.city ?? entry.name}
      </p>
      {entry.state && (
        <p className="text-xs text-slate-500 mb-2">{entry.state}</p>
      )}
      <div className="flex flex-wrap gap-1.5 justify-center mb-3">
        <TierBadge tier={entry.tier} />
        <StatusBadge status={entry.status} />
      </div>
      <div className="w-full grid grid-cols-2 gap-2 text-center">
        <div className="bg-slate-50 rounded-xl p-2.5">
          <p className="text-xs text-slate-500 mb-0.5">Revenue</p>
          <p className="text-sm font-bold text-slate-800">{formatInr(entry.revenueInr)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-2.5">
          <p className="text-xs text-slate-500 mb-0.5">Deals</p>
          <p className="text-sm font-bold text-slate-800">{entry.dealsClosed}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-2.5">
          <p className="text-xs text-slate-500 mb-0.5">Conv%</p>
          <p className="text-sm font-bold text-slate-800">{formatPct(entry.conversionRate)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-2.5">
          <p className="text-xs text-slate-500 mb-0.5">Agents</p>
          <p className="text-sm font-bold text-slate-800">{entry.agentCount}</p>
        </div>
      </div>
    </div>
  );
}

function PodiumSkeleton() {
  return (
    <div className="flex flex-col items-center bg-white rounded-2xl border border-slate-200 p-5 gap-3">
      <div className="h-10 w-10 rounded-full bg-slate-100 animate-pulse" />
      <div className="h-4 w-24 rounded bg-slate-100 animate-pulse" />
      <div className="h-3 w-16 rounded bg-slate-100 animate-pulse" />
      <div className="w-full grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <tr className="border-b border-slate-100">
      {Array.from({ length: 9 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

function RankCell({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <span className="text-base">{MEDAL_EMOJI[rank - 1]}</span>
    );
  }
  return <span className="text-sm text-slate-500 font-medium tabular-nums">#{rank}</span>;
}

export default function FranchiseLeaderboardPage() {
  const [period, setPeriod] = useState<Period>('month');
  const { data, isLoading, error } = useLeaderboard(period);

  const franchises: LeaderboardEntry[] = data?.franchises ?? [];
  const top3 = franchises.slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/franchise"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-2 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Franchise Network
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">City Leaderboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track performance across all franchise cities
          </p>
        </div>

        <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-0.5">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <PodiumSkeleton />
          <PodiumSkeleton />
          <PodiumSkeleton />
        </div>
      ) : top3.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {top3.map((entry, idx) => (
            <PodiumCard key={entry.id} entry={entry} rank={idx + 1} />
          ))}
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-16">
                  Rank
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  City
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  State
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Tier
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Agents
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Leads
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Deals
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Conv%
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Revenue
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => <TableRowSkeleton key={i} />)
              ) : franchises.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-14 text-center text-sm text-slate-400">
                    No franchise data yet for this period
                  </td>
                </tr>
              ) : (
                franchises.map((entry, idx) => {
                  const rank = idx + 1;
                  const borderCls = rank <= 3 ? MEDAL_BORDER[idx] : '';
                  return (
                    <tr
                      key={entry.id}
                      className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors ${borderCls}`}
                    >
                      <td className="px-4 py-3 text-center">
                        <RankCell rank={rank} />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {entry.city ?? entry.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {entry.state ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <TierBadge tier={entry.tier} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {entry.agentCount}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {entry.leadsReceived}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {entry.dealsClosed}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {formatPct(entry.conversionRate)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">
                        {formatInr(entry.revenueInr)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={entry.status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 text-center">
          Failed to load leaderboard data. Please refresh.
        </p>
      )}
    </div>
  );
}
