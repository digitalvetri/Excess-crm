'use client';

import Link from 'next/link';
import { ArrowLeft, Send, XCircle, TrendingUp, BarChart2 } from 'lucide-react';
import { useBroadcastAnalytics } from '@/hooks/use-broadcasts';
import type { BroadcastStatus } from '@/hooks/use-broadcasts';

const STATUS_BADGE: Record<BroadcastStatus, string> = {
  DRAFT:     'bg-slate-100 text-slate-600',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  SENDING:   'bg-amber-100 text-amber-700',
  SENT:      'bg-green-100 text-green-700',
  FAILED:    'bg-red-100 text-red-700',
};

function KpiCard({ label, value, sub, icon: Icon, cls }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; cls: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-border p-5 flex items-center gap-4">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function BroadcastAnalyticsPage() {
  const { data, isLoading, isError } = useBroadcastAnalytics();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/broadcasts"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary transition-colors"
        >
          <ArrowLeft size={14} /> Broadcasts
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-900">Analytics</h1>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-white rounded-2xl border border-border animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-danger text-sm">Failed to load analytics. Please refresh.</p>
      ) : data ? (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <KpiCard
              label="Total Sent"
              value={data.totalSent.toLocaleString('en-IN')}
              icon={Send}
              cls="bg-green-100 text-success"
            />
            <KpiCard
              label="Total Failed"
              value={data.totalFailed.toLocaleString('en-IN')}
              icon={XCircle}
              cls="bg-red-100 text-danger"
            />
            <KpiCard
              label="Delivery Rate"
              value={`${data.deliveryRate}%`}
              sub={`${data.totalSent + data.totalFailed} attempted`}
              icon={TrendingUp}
              cls="bg-blue-100 text-primary"
            />
          </div>

          {/* Status breakdown */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 size={16} className="text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700">Broadcasts by Status</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              {Object.entries(data.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center gap-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[status as BroadcastStatus] ?? 'bg-slate-100 text-slate-600'}`}>
                    {status}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">{count}</span>
                </div>
              ))}
              {Object.keys(data.byStatus).length === 0 && (
                <p className="text-sm text-slate-400">No broadcast data yet.</p>
              )}
            </div>
          </div>

          {/* Per-campaign table */}
          {data.campaigns.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-border bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-border">
                  <tr>
                    {['Campaign', 'Status', 'Recipients', 'Sent', 'Failed', 'Rate', 'Conversions', 'Date'].map((col) => (
                      <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.campaigns.map((c) => {
                    const rate    = c.recipientCount > 0 ? Math.round((c.sentCount / c.recipientCount) * 100) : 0;
                    const convRate = c.sentCount > 0 ? Math.round((c.conversions / c.sentCount) * 100) : 0;
                    return (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px] truncate">
                          {c.name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[c.status]}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{c.recipientCount.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-success text-xs font-medium">{c.sentCount.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-danger text-xs">{c.failedCount.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-success rounded-full" style={{ width: `${rate}%` }} />
                            </div>
                            <span className="text-slate-600">{rate}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {c.conversions > 0 ? (
                            <span className="text-success font-semibold">{c.conversions} <span className="text-slate-400 font-normal">({convRate}%)</span></span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                          {new Date(c.createdAt).toLocaleDateString('en-IN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
