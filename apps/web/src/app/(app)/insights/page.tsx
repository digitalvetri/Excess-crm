'use client';

import { useCohorts, useForecast, type CohortRow } from '@/hooks/use-insights';

function rateColor(rate: number): string {
  if (rate >= 30) return 'bg-green-500';
  if (rate >= 15) return 'bg-amber-400';
  if (rate > 0) return 'bg-orange-400';
  return 'bg-slate-200';
}

function formatCurrency(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value}`;
}

const STAGE_LABEL: Record<string, string> = {
  NEW: 'New',
  QUALIFIED: 'Qualified',
  FOLLOW_UP: 'Follow Up',
  NOT_ANSWERED: 'Not Answered',
};

function fmtMonth(period: string): string {
  const [y, m] = period.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function BreakdownTable({ title, rows }: { title: string; rows: CohortRow[] }) {
  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-slate-50">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 px-4 py-6 text-center">No data</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-slate-500">
              <th className="text-left px-4 py-2 font-medium">Segment</th>
              <th className="text-right px-4 py-2 font-medium">Leads</th>
              <th className="text-right px-4 py-2 font-medium">Converted</th>
              <th className="text-right px-4 py-2 font-medium">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-slate-700">{r.key.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2 text-right text-slate-600">{r.totalLeads}</td>
                <td className="px-4 py-2 text-right text-green-700 font-medium">{r.converted}</td>
                <td className="px-4 py-2 text-right text-slate-700">{r.conversionRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function InsightsPage() {
  const cohorts = useCohorts();
  const forecast = useForecast();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Insights</h1>
        <p className="text-sm text-slate-500 mt-1">Cohort, conversion and pipeline intelligence.</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Pipeline Forecast</h2>
        {forecast.isLoading ? (
          <div className="h-40 bg-white rounded-xl border border-border animate-pulse" />
        ) : forecast.isError || !forecast.data ? (
          <p className="text-sm text-danger">Failed to load forecast.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-border p-5">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Committed (Won)</p>
                <p className="text-2xl font-bold text-green-700">
                  {formatCurrency(forecast.data.committedRevenue)}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-border p-5">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Weighted Pipeline</p>
                <p className="text-2xl font-bold text-primary">
                  {formatCurrency(forecast.data.totalWeighted)}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-border p-5">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Best Case (Open)</p>
                <p className="text-2xl font-bold text-slate-900">
                  {formatCurrency(forecast.data.totalRaw)}
                </p>
              </div>
            </div>

            {forecast.data.stages.length > 0 && (
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-slate-50 text-xs text-slate-500">
                      <th className="text-left px-4 py-3 font-medium">Stage</th>
                      <th className="text-right px-4 py-3 font-medium">Win Probability</th>
                      <th className="text-right px-4 py-3 font-medium">Open Leads</th>
                      <th className="text-right px-4 py-3 font-medium">Raw Value</th>
                      <th className="text-right px-4 py-3 font-medium">Weighted Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.data.stages.map((s) => (
                      <tr key={s.stage} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {STAGE_LABEL[s.stage] ?? s.stage}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {Math.round(s.probability * 100)}%
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{s.leadCount}</td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatCurrency(s.rawValue)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-primary">
                          {formatCurrency(s.weightedValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Acquisition Cohorts</h2>
        {cohorts.isLoading ? (
          <div className="h-48 bg-white rounded-xl border border-border animate-pulse" />
        ) : cohorts.isError ? (
          <p className="text-sm text-danger">Failed to load cohorts.</p>
        ) : !cohorts.data || cohorts.data.monthly.length === 0 ? (
          <div className="bg-white rounded-xl border border-border p-8 text-center">
            <p className="text-sm text-slate-500">No lead data in the last 12 months.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-slate-50 text-xs text-slate-500">
                    <th className="text-left px-4 py-3 font-medium">Cohort (month acquired)</th>
                    <th className="text-right px-4 py-3 font-medium">Leads</th>
                    <th className="text-right px-4 py-3 font-medium">Qualified</th>
                    <th className="text-right px-4 py-3 font-medium">Converted</th>
                    <th className="text-left px-4 py-3 font-medium w-48">Conversion Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.data.monthly.map((c) => (
                    <tr key={c.key} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-800">{fmtMonth(c.key)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{c.totalLeads}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{c.qualified}</td>
                      <td className="px-4 py-3 text-right text-green-700 font-medium">{c.converted}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${rateColor(c.conversionRate)}`}
                              style={{ width: `${Math.min(c.conversionRate, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500 w-9 text-right">{c.conversionRate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BreakdownTable title="By Source" rows={cohorts.data.bySource} />
              <BreakdownTable title="By Team" rows={cohorts.data.byTeam} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
