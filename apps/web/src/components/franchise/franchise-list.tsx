'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, Users, TrendingUp, ChevronRight, Plus } from 'lucide-react';
import { useFranchises } from '@/hooks/use-franchise';
import { NewFranchiseDialog } from './new-franchise-dialog';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ONBOARDING: { label: 'Onboarding', className: 'bg-blue-100 text-blue-700' },
  ACTIVE: { label: 'Active', className: 'bg-green-100 text-green-700' },
  PROBATION: { label: 'Probation', className: 'bg-amber-100 text-amber-700' },
  SUSPENDED: { label: 'Suspended', className: 'bg-orange-100 text-orange-700' },
  TERMINATED: { label: 'Terminated', className: 'bg-red-100 text-red-600' },
};

const TIER_CONFIG: Record<string, { label: string; className: string }> = {
  BRONZE: { label: 'Bronze', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  SILVER: { label: 'Silver', className: 'bg-slate-50 text-slate-700 border border-slate-300' },
  GOLD: { label: 'Gold', className: 'bg-yellow-50 text-yellow-700 border border-yellow-300' },
};

export function FranchiseList() {
  const { data, isLoading, isError } = useFranchises();
  const [showNew, setShowNew] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-xl border border-border animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 text-center">
        <p className="text-sm text-danger">Failed to load franchises.</p>
      </div>
    );
  }

  const franchises = data ?? [];

  if (franchises.length === 0) {
    return (
      <>
        <div className="flex justify-end">
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} /> New Franchise
          </button>
        </div>
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <Building2 className="mx-auto mb-3 text-slate-300" size={32} />
          <p className="text-slate-500 text-sm">No franchise partners yet.</p>
        </div>
        {showNew && <NewFranchiseDialog onClose={() => setShowNew(false)} />}
      </>
    );
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} /> New Franchise
        </button>
      </div>
      {showNew && <NewFranchiseDialog onClose={() => setShowNew(false)} />}
    <div className="space-y-3">
      {franchises.map((f) => {
        const statusCfg = STATUS_CONFIG[f.status] ?? { label: f.status, className: 'bg-slate-100 text-slate-600' };
        const tierCfg = f.tier ? (TIER_CONFIG[f.tier] ?? null) : null;
        return (
          <Link
            key={f.id}
            href={`/franchise/${f.id}`}
            className="block bg-white rounded-xl border border-border p-5 hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="p-2.5 bg-primary/10 rounded-lg shrink-0">
                  <Building2 size={18} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800">{f.name}</p>
                    {tierCfg && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tierCfg.className}`}>
                        {tierCfg.label}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.className}`}>
                      {statusCfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Users size={11} /> {f._count.users} users
                    </span>
                    <span className="flex items-center gap-1">
                      <TrendingUp size={11} /> {f._count.leads} leads
                    </span>
                    {f.contactName && <span>{f.contactName}</span>}
                  </div>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400 shrink-0" />
            </div>
          </Link>
        );
      })}
    </div>
    </>
  );
}
