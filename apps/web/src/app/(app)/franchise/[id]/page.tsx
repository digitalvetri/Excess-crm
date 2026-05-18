'use client';

import { use } from 'react';
import { Building2, TrendingUp, Users, DollarSign, AlertTriangle } from 'lucide-react';
import { useFranchise, useFranchiseStats, useFranchiseAction } from '@/hooks/use-franchise';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ONBOARDING: { label: 'Onboarding', className: 'bg-blue-100 text-blue-700' },
  ACTIVE: { label: 'Active', className: 'bg-green-100 text-green-700' },
  PROBATION: { label: 'Probation', className: 'bg-amber-100 text-amber-700' },
  SUSPENDED: { label: 'Suspended', className: 'bg-orange-100 text-orange-700' },
  TERMINATED: { label: 'Terminated', className: 'bg-red-100 text-red-600' },
};

export default function FranchiseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: franchise, isLoading } = useFranchise(id);
  const { data: stats } = useFranchiseStats(id);
  const action = useFranchiseAction();

  if (isLoading) {
    return <div className="h-96 bg-white rounded-xl animate-pulse" />;
  }

  if (!franchise) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 text-center">
        <p className="text-sm text-slate-500">Franchise not found.</p>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[franchise.status] ?? { label: franchise.status, className: 'bg-slate-100 text-slate-600' };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-xl">
            <Building2 size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{franchise.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.className}`}>
                {statusCfg.label}
              </span>
              {franchise.tier && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  {franchise.tier}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {franchise.status === 'ONBOARDING' && (
            <button
              onClick={() => action.mutate({ id, action: 'activate' })}
              disabled={action.isPending}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Activate
            </button>
          )}
          {franchise.status === 'ACTIVE' && (
            <button
              onClick={() => action.mutate({ id, action: 'suspend' })}
              disabled={action.isPending}
              className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              Suspend
            </button>
          )}
          {franchise.status !== 'TERMINATED' && (
            <button
              onClick={() => {
                if (confirm('Terminate this franchise? This cannot be undone.')) {
                  action.mutate({ id, action: 'terminate' });
                }
              }}
              disabled={action.isPending}
              className="px-4 py-2 bg-danger text-white text-sm font-medium rounded-lg hover:bg-danger/90 disabled:opacity-50 transition-colors"
            >
              Terminate
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Leads', value: stats.totalLeads.toLocaleString(), icon: TrendingUp },
            { label: 'Converted', value: stats.convertedLeads.toLocaleString(), icon: Users },
            { label: 'Conversion', value: `${stats.conversionRate}%`, icon: TrendingUp },
            { label: 'Commission Earned', value: `₹${Number(stats.totalEarnedInr).toLocaleString('en-IN')}`, icon: DollarSign },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white rounded-xl border border-border p-5">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className="text-slate-400" />
                <p className="text-xs text-slate-500">{label}</p>
              </div>
              <p className="text-2xl font-bold text-slate-800">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Contact Details</h3>
          <dl className="space-y-2 text-sm">
            {[
              { label: 'Contact', value: franchise.contactName },
              { label: 'Email', value: franchise.contactEmail },
              { label: 'Phone', value: franchise.contactPhone },
              { label: 'GST', value: franchise.gstNumber },
            ].map(({ label, value }) =>
              value ? (
                <div key={label} className="flex gap-3">
                  <dt className="w-16 shrink-0 text-slate-500">{label}</dt>
                  <dd className="text-slate-800">{value}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </div>

        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Commission Slabs</h3>
          {franchise.commissionSlabs ? (
            <div className="space-y-2">
              {Object.entries(franchise.commissionSlabs).map(([threshold, rate]) => (
                <div key={threshold} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">≥ ₹{Number(threshold).toLocaleString('en-IN')}</span>
                  <span className="font-medium text-slate-800">{String(rate)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <AlertTriangle size={14} />
              No commission slabs configured
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
