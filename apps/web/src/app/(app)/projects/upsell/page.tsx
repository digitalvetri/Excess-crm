'use client';

import { format } from 'date-fns';
import { toast } from 'sonner';
import { Zap, Battery, TrendingUp, Phone, Loader2 } from 'lucide-react';
import { useUpsellCandidates, useStartUpsell } from '@/hooks/use-upsell';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function UpsellPipelinePage() {
  const { data, isLoading } = useUpsellCandidates();
  const startUpsell = useStartUpsell();

  const candidates = data?.candidates ?? [];
  const avgKw =
    candidates.length > 0
      ? (candidates.reduce((s, c) => s + c.systemKw, 0) / candidates.length).toFixed(1)
      : '—';
  const avgRoi =
    candidates.filter((c) => c.batteryRoiYears > 0).length > 0
      ? (
          candidates.filter((c) => c.batteryRoiYears > 0).reduce((s, c) => s + c.batteryRoiYears, 0) /
          candidates.filter((c) => c.batteryRoiYears > 0).length
        ).toFixed(1)
      : '—';

  async function handleStartUpsell(projectId: string, name: string) {
    try {
      await startUpsell.mutateAsync(projectId);
      toast.success(`Upsell call queued for ${name}!`);
    } catch {
      toast.error('Failed to queue upsell call. Please try again.');
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
          <Zap size={20} className="text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Upsell Pipeline</h1>
          <p className="text-sm text-slate-500">Customers ready for battery storage or system expansion</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total Candidates" value={data?.total ?? 0} sub="6+ months post-installation" />
        <StatCard label="Avg System Size" value={avgKw !== '—' ? `${avgKw} kW` : '—'} sub="across all candidates" />
        <StatCard label="Avg Battery ROI" value={avgRoi !== '—' ? `${avgRoi} yrs` : '—'} sub="based on generation data" />
      </div>

      {/* Table */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading candidates...</span>
          </div>
        ) : candidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
            <Battery size={32} />
            <p className="text-sm font-medium">No upsell candidates yet</p>
            <p className="text-xs">Customers will appear here 6 months after installation.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Project #</th>
                  <th className="px-4 py-3">System</th>
                  <th className="px-4 py-3">Installed</th>
                  <th className="px-4 py-3">Avg Generation</th>
                  <th className="px-4 py-3">Battery Fit</th>
                  <th className="px-4 py-3">ROI</th>
                  <th className="px-4 py-3">AMC</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{c.lead.name}</p>
                      {c.lead.city && <p className="text-xs text-slate-400">{c.lead.city}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.number}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{c.systemKw} kW</td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.handedOverAt ? format(new Date(c.handedOverAt), 'MMM yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {c.avgMonthlyKwhGenerated > 0 ? (
                        <span className="inline-flex items-center gap-1 text-success font-medium">
                          <TrendingUp size={12} />
                          {c.avgMonthlyKwhGenerated} kWh/mo
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">No data</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="inline-flex items-center gap-1">
                        <Battery size={12} className="text-primary" />
                        {c.estimatedBatteryKwh} kWh
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.batteryRoiYears > 0 ? (
                        <span className="font-medium text-slate-800">{c.batteryRoiYears} yrs</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.amcContracts.length > 0 ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-success">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          No AMC
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => void handleStartUpsell(c.id, c.lead.name)}
                        disabled={startUpsell.isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {startUpsell.isPending ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Phone size={12} />
                        )}
                        Start Upsell Call
                      </button>
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
