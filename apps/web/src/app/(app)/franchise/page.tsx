'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Building2,
  Users,
  TrendingUp,
  ChevronRight,
  Plus,
  Search,
  Trophy,
} from 'lucide-react';
import {
  useNetworkSummary,
  useFranchises,
  type FranchiseStatus,
  type FranchiseTier,
} from '@/hooks/use-franchise';
import { OnboardFranchiseWizard } from '@/components/franchise/onboard-franchise-wizard';

// ─── Config ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<FranchiseStatus, { label: string; className: string }> = {
  ONBOARDING:  { label: 'Onboarding',  className: 'bg-blue-100 text-blue-700' },
  ACTIVE:      { label: 'Active',      className: 'bg-green-100 text-green-700' },
  PROBATION:   { label: 'Probation',   className: 'bg-amber-100 text-amber-700' },
  SUSPENDED:   { label: 'Suspended',   className: 'bg-orange-100 text-orange-700' },
  TERMINATED:  { label: 'Terminated',  className: 'bg-red-100 text-red-600' },
};

const TIER_CONFIG: Record<FranchiseTier, { label: string; className: string }> = {
  BRONZE: { label: 'Bronze', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  SILVER: { label: 'Silver', className: 'bg-slate-50 text-slate-600 border border-slate-200' },
  GOLD:   { label: 'Gold',   className: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
};

// ─── Summary strip chip ───────────────────────────────────────────────────────

function SummaryChip({
  label,
  value,
  className = 'bg-white border-border text-slate-700',
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium ${className}`}>
      <span className="text-xs font-normal opacity-70">{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function FranchiseSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 bg-white rounded-xl border border-border animate-pulse" />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FranchisePage() {
  const [showNew, setShowNew]       = useState(false);
  const [search, setSearch]         = useState('');
  const [tierFilter, setTierFilter] = useState<'' | FranchiseTier>('');
  const [statusFilter, setStatusFilter] = useState<'' | FranchiseStatus>('');

  const summary  = useNetworkSummary();
  const list     = useFranchises();

  // Client-side filtering
  const franchises = useMemo(() => {
    const raw = list.data ?? [];
    return raw.filter((f) => {
      const matchSearch =
        !search ||
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        (f.contactName?.toLowerCase().includes(search.toLowerCase()) ?? false);
      const matchTier   = !tierFilter   || f.tier   === tierFilter;
      const matchStatus = !statusFilter || f.status === statusFilter;
      return matchSearch && matchTier && matchStatus;
    });
  }, [list.data, search, tierFilter, statusFilter]);

  const pendingInr = summary.data?.pendingCommissionInr
    ? `₹${Number(summary.data.pendingCommissionInr).toLocaleString('en-IN')}`
    : '₹0';

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Franchise Network</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage franchise partners and their performance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/franchise/leaderboard"
            className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium rounded-lg hover:bg-amber-100 transition-colors"
          >
            <Trophy size={15} />
            Leaderboard
          </Link>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} />
            Onboard City
          </button>
        </div>
      </div>

      {/* ── Network summary strip ── */}
      {summary.data && (
        <div className="flex flex-wrap gap-2">
          <SummaryChip
            label="Total"
            value={summary.data.total}
          />
          <SummaryChip
            label="Active"
            value={summary.data.active}
            className="bg-green-50 border-green-200 text-green-700"
          />
          <SummaryChip
            label="Onboarding"
            value={summary.data.onboarding}
            className="bg-blue-50 border-blue-200 text-blue-700"
          />
          <SummaryChip
            label="Pending commission"
            value={pendingInr}
            className="bg-amber-50 border-amber-200 text-amber-700"
          />
        </div>
      )}
      {summary.isLoading && (
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 w-36 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or contact…"
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as '' | FranchiseTier)}
          className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All Tiers</option>
          <option value="BRONZE">Bronze</option>
          <option value="SILVER">Silver</option>
          <option value="GOLD">Gold</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | FranchiseStatus)}
          className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ONBOARDING">Onboarding</option>
          <option value="PROBATION">Probation</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="TERMINATED">Terminated</option>
        </select>
      </div>

      {/* ── Franchise list ── */}
      {list.isLoading ? (
        <FranchiseSkeleton />
      ) : list.isError ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-red-600">Failed to load franchises. Please refresh.</p>
        </div>
      ) : franchises.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-14 text-center">
          <Building2 className="mx-auto mb-3 text-slate-300" size={36} />
          <p className="text-slate-500 text-sm font-medium">
            {list.data?.length === 0
              ? 'No franchise partners yet. Add your first one.'
              : 'No franchises match your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {franchises.map((f) => {
            const statusCfg =
              STATUS_CONFIG[f.status] ?? { label: f.status, className: 'bg-slate-100 text-slate-600' };
            const tierCfg = f.tier ? (TIER_CONFIG[f.tier] ?? null) : null;
            return (
              <Link
                key={f.id}
                href={`/franchise/${f.id}`}
                className="block bg-white rounded-xl border border-border p-5 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="p-2.5 bg-primary/10 rounded-lg shrink-0">
                      <Building2 size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      {/* Row 1: name + badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-800 truncate">{f.name}</p>
                        {tierCfg && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tierCfg.className}`}>
                            {tierCfg.label}
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.className}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                      {/* Row 2: meta */}
                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Users size={11} />
                          {f._count.users} {f._count.users === 1 ? 'user' : 'users'}
                        </span>
                        <span className="flex items-center gap-1">
                          <TrendingUp size={11} />
                          {f._count.leads} {f._count.leads === 1 ? 'lead' : 'leads'}
                        </span>
                        {f.contactName && (
                          <span className="truncate">{f.contactName}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-400 shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Onboard Wizard ── */}
      <OnboardFranchiseWizard open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}
