'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import {
  useFunnel,
  useDailyTrend,
  useSourceBreakdown,
  useAgentPerformance,
  useRevenuePipeline,
  useCallAnalytics,
  useNps,
} from '@/hooks/use-reports';
import { useTerritoryRevenue, useProfitability } from '@/hooks/use-financial';

const STAGE_COLORS: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  QUALIFIED: 'bg-blue-100 text-blue-700',
  FOLLOW_UP: 'bg-amber-100 text-amber-700',
  CONVERTED: 'bg-green-100 text-green-700',
  NOT_ANSWERED: 'bg-orange-100 text-orange-700',
  INVALID: 'bg-red-100 text-red-700',
  WRONG_ENQUIRY: 'bg-red-100 text-red-700',
};

const PIE_COLORS = ['#0B7A3D', '#F39C12', '#15A34A', '#C0392B', '#8E44AD', '#0EA5E9'];

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '₹0';
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num.toFixed(0)}`;
}

export default function ReportsPage() {
  const revenue = useRevenuePipeline();
  const funnel = useFunnel();
  const dailyTrend = useDailyTrend();
  const sources = useSourceBreakdown();
  const agents = useAgentPerformance();
  const callAnalytics = useCallAnalytics();
  const nps = useNps();
  const territory = useTerritoryRevenue();
  const profitability = useProfitability();

  const totalLeads =
    funnel.data?.stages.reduce((sum, s) => sum + s.count, 0) ?? 0;

  const sortedAgents = agents.data
    ? [...agents.data.agents].sort((a, b) => b.converted - a.converted)
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
        <p className="text-sm text-slate-500 mt-1">Pipeline overview and performance metrics</p>
      </div>

      {/* Section 0: Call Analytics */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Call Analytics</h2>
        {callAnalytics.loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-border p-5 animate-pulse h-24" />
            ))}
          </div>
        ) : callAnalytics.error ? (
          <p className="text-sm text-red-500">{callAnalytics.error}</p>
        ) : !callAnalytics.data ? null : (
          <div className="space-y-4">
            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-border border-l-4 border-l-primary p-5 hover:shadow-sm transition-shadow">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Total Calls (Month)</p>
                <p className="text-3xl font-bold text-slate-900 tabular-nums">{callAnalytics.data.totalCalls.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-1">AI voice agent dials</p>
              </div>
              <div className="bg-white rounded-xl border border-border border-l-4 border-l-success p-5 hover:shadow-sm transition-shadow">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Connect Rate</p>
                <p className="text-3xl font-bold text-success tabular-nums">{callAnalytics.data.connectRate}%</p>
                <p className="text-xs text-slate-400 mt-1">answered calls</p>
              </div>
              <div className="bg-white rounded-xl border border-border border-l-4 border-l-sky-500 p-5 hover:shadow-sm transition-shadow">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Avg Duration</p>
                <p className="text-3xl font-bold text-slate-900 tabular-nums">
                  {Math.floor(callAnalytics.data.avgDurationSec / 60)}m {callAnalytics.data.avgDurationSec % 60}s
                </p>
                <p className="text-xs text-slate-400 mt-1">per connected call</p>
              </div>
            </div>

            {/* Daily call volume + by hour */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-border p-5">
                <p className="text-sm font-semibold text-slate-700 mb-4">Daily Call Volume (14 days)</p>
                {callAnalytics.data.daily.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No call data yet</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={callAnalytics.data.daily} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v: string) => v.slice(-5)} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                      <Line type="monotone" dataKey="count" stroke="#0B7A3D" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-white rounded-xl border border-border p-5">
                <p className="text-sm font-semibold text-slate-700 mb-4">Calls by Hour (IST, 30 days)</p>
                {callAnalytics.data.byHour.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No call data yet</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={callAnalytics.data.byHour} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v: number) => v === 0 ? '12a' : v < 12 ? `${v}a` : v === 12 ? '12p' : `${v - 12}p`} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={(v) => [v, 'calls']} />
                      <Bar dataKey="count" fill="#F39C12" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* By persona */}
            {callAnalytics.data.byPersona.length > 0 && (
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-slate-50">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">AI Persona</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Total Calls</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Connected</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Connect Rate</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Avg Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {callAnalytics.data.byPersona.map((p) => (
                      <tr key={p.persona} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium text-slate-800">{p.persona.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{p.total.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-green-700 font-medium">{p.connected.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{p.connectRate}%</td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {Math.floor(p.avgDurationSec / 60)}m {p.avgDurationSec % 60}s
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

      {/* Section 1: Revenue Pipeline */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Revenue Pipeline</h2>
        {revenue.loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : revenue.error ? (
          <p className="text-sm text-red-500">{revenue.error}</p>
        ) : !revenue.data ? (
          <p className="text-sm text-slate-400">No data available</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-border p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                Qualified Pipeline
              </p>
              <p className="text-2xl font-bold text-slate-900">
                {formatCurrency(revenue.data.qualifiedPipeline)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-border p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                Converted Revenue
              </p>
              <p className="text-2xl font-bold text-green-700">
                {formatCurrency(revenue.data.convertedRevenue)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-border p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                Quotations This Month
              </p>
              <p className="text-2xl font-bold text-slate-900">
                {revenue.data.quotationsThisMonth}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Section 1b: Customer NPS */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Customer Satisfaction (NPS)</h2>
        {nps.loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : nps.error ? (
          <p className="text-sm text-red-500">{nps.error}</p>
        ) : !nps.data ? (
          <p className="text-sm text-slate-400">No data available</p>
        ) : nps.data.total === 0 ? (
          <div className="bg-white rounded-xl border border-border p-8 text-center">
            <p className="text-sm text-slate-500">No NPS responses yet.</p>
            <p className="text-xs text-slate-400 mt-1">
              Surveys are sent automatically 7 days after a project is commissioned.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-border p-5">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">NPS Score</p>
                <p className={`text-3xl font-bold ${nps.data.nps >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {nps.data.nps > 0 ? '+' : ''}
                  {nps.data.nps}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-border p-5">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Avg Score</p>
                <p className="text-3xl font-bold text-slate-900">{nps.data.avgScore}/10</p>
              </div>
              <div className="bg-white rounded-xl border border-border p-5">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Responses</p>
                <p className="text-3xl font-bold text-slate-900">{nps.data.total}</p>
              </div>
              <div className="bg-white rounded-xl border border-border p-5">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Response Rate</p>
                <p className="text-3xl font-bold text-primary">{nps.data.responseRate}%</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-border p-5">
              <div className="mb-2">
                <ResponsiveContainer width="100%" height={12}>
                  <BarChart
                    data={[{ detractors: nps.data.detractors, passives: nps.data.passives, promoters: nps.data.promoters }]}
                    layout="vertical"
                    margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                    barCategoryGap={0}
                  >
                    <XAxis type="number" hide domain={[0, nps.data.total]} />
                    <YAxis type="category" hide />
                    <Bar dataKey="detractors" stackId="nps" fill="#ef4444" />
                    <Bar dataKey="passives" stackId="nps" fill="#fbbf24" />
                    <Bar dataKey="promoters" stackId="nps" fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Detractors (0–6): {nps.data.detractors}</span>
                <span>Passives (7–8): {nps.data.passives}</span>
                <span>Promoters (9–10): {nps.data.promoters}</span>
              </div>
            </div>

            {nps.data.recentComments.length > 0 && (
              <div className="bg-white rounded-xl border border-border p-5">
                <p className="text-sm font-semibold text-slate-700 mb-3">Recent Comments</p>
                <div className="space-y-2">
                  {nps.data.recentComments.map((c, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm border-b border-border last:border-0 pb-2 last:pb-0">
                      <span
                        className={`shrink-0 w-8 text-center font-bold rounded ${
                          (c.score ?? 0) >= 9
                            ? 'text-green-700'
                            : (c.score ?? 0) >= 7
                              ? 'text-amber-600'
                              : 'text-red-600'
                        }`}
                      >
                        {c.score}
                      </span>
                      <div>
                        <span className="text-slate-800">{c.comment}</span>
                        <span className="text-xs text-slate-400 ml-2">— {c.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Section 2: Lead Funnel */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Lead Funnel</h2>
        {funnel.loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : funnel.error ? (
          <p className="text-sm text-red-500">{funnel.error}</p>
        ) : !funnel.data || funnel.data.stages.length === 0 ? (
          <p className="text-sm text-slate-400">No data available</p>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Stage</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Count</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {funnel.data.stages.map((s) => {
                  const pct = totalLeads > 0 ? ((s.count / totalLeads) * 100).toFixed(1) : '0.0';
                  const colorClass = STAGE_COLORS[s.stage] ?? 'bg-slate-100 text-slate-700';
                  return (
                    <tr key={s.stage} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
                        >
                          {s.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">
                        {s.count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-700">Total</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">
                    {totalLeads.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-600">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Section 3: Daily Lead Trend */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Daily Lead Trend</h2>
        {dailyTrend.loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : dailyTrend.error ? (
          <p className="text-sm text-red-500">{dailyTrend.error}</p>
        ) : !dailyTrend.data || dailyTrend.data.length === 0 ? (
          <p className="text-sm text-slate-400">No data available</p>
        ) : (
          <div className="bg-white rounded-xl border border-border p-5">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dailyTrend.data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickFormatter={(val: string) => val.slice(-7)}
                />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="count" fill="#0B7A3D" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Section 4a: Territory Revenue */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Territory Revenue</h2>
        {territory.loading ? (
          <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />
        ) : territory.error ? (
          <p className="text-sm text-red-500">{territory.error}</p>
        ) : !territory.data || territory.data.territories.length === 0 ? (
          <p className="text-sm text-slate-400">No territory data yet — appears once projects are handed over.</p>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="flex gap-6 px-5 py-3 bg-slate-50 border-b border-border text-xs text-slate-500">
              <span>{territory.data.totalInstalled} installations</span>
              <span>Total: {formatCurrency(territory.data.totalValueInr)}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Pincode</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">City</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Projects</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Revenue</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Received</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Collection</th>
                </tr>
              </thead>
              <tbody>
                {territory.data.territories.slice(0, 15).map((t) => (
                  <tr key={t.pincode} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-slate-800">{t.pincode}</td>
                    <td className="px-4 py-3 text-slate-600">{t.city ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-800">{t.projectCount}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{formatCurrency(t.totalValueInr)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(t.totalReceivedInr)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.collectionRate >= 90 ? 'bg-green-100 text-green-700' :
                        t.collectionRate >= 70 ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-600'
                      }`}>{t.collectionRate}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 4b: Project Profitability */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Project Profitability (This Year)</h2>
        {profitability.loading ? (
          <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />
        ) : profitability.error ? (
          <p className="text-sm text-red-500">{profitability.error}</p>
        ) : !profitability.data || profitability.data.projects.length === 0 ? (
          <p className="text-sm text-slate-400">No handed-over projects this year yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border bg-white p-4">
                <p className="text-xs text-slate-500">Total Value</p>
                <p className="text-xl font-bold text-slate-900">{formatCurrency(profitability.data.summary.totalValueInr)}</p>
              </div>
              <div className="rounded-xl border border-border bg-white p-4">
                <p className="text-xs text-slate-500">Total Received</p>
                <p className="text-xl font-bold text-green-700">{formatCurrency(profitability.data.summary.totalReceivedInr)}</p>
              </div>
              <div className="rounded-xl border border-border bg-white p-4">
                <p className="text-xs text-slate-500">Outstanding</p>
                <p className="text-xl font-bold text-red-600">{formatCurrency(profitability.data.summary.totalOutstandingInr)}</p>
              </div>
              <div className="rounded-xl border border-border bg-white p-4">
                <p className="text-xs text-slate-500">Avg Collection</p>
                <p className="text-xl font-bold text-slate-900">{profitability.data.summary.avgCollectionPct}%</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-slate-50">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Project</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Customer</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600">kW</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600">Value</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600">Received</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600">Outstanding</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600">Collection</th>
                  </tr>
                </thead>
                <tbody>
                  {profitability.data.projects.slice(0, 20).map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{p.number}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{p.customerName}</p>
                        {p.city && <p className="text-xs text-slate-400">{p.city}</p>}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{p.systemKw}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">{formatCurrency(p.totalValueInr)}</td>
                      <td className="px-4 py-3 text-right text-green-700">{formatCurrency(p.totalReceivedInr)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${p.outstandingInr > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {p.outstandingInr > 0 ? formatCurrency(p.outstandingInr) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.collectionPct >= 90 ? 'bg-green-100 text-green-700' :
                          p.collectionPct >= 70 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-600'
                        }`}>{p.collectionPct}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Section 4: Source Breakdown + Agent Performance */}
      <section>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Source Breakdown */}
          <div>
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Source Breakdown</h2>
            {sources.loading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : sources.error ? (
              <p className="text-sm text-red-500">{sources.error}</p>
            ) : !sources.data || sources.data.sources.length === 0 ? (
              <p className="text-sm text-slate-400">No data available</p>
            ) : (
              <div className="bg-white rounded-xl border border-border p-5">
                <PieChart width={320} height={280}>
                  <Pie
                    data={sources.data.sources}
                    dataKey="count"
                    nameKey="sourceType"
                    cx="50%"
                    cy="45%"
                    outerRadius={90}
                    label={({ sourceType }: { sourceType: string }) => sourceType}
                    labelLine={false}
                  >
                    {sources.data.sources.map((_entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Legend
                    iconType="circle"
                    iconSize={10}
                    formatter={(value: string) => (
                      <span style={{ fontSize: 12, color: '#475569' }}>{value}</span>
                    )}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                </PieChart>
              </div>
            )}
          </div>

          {/* Agent Performance */}
          <div>
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Agent Performance</h2>
            {agents.loading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : agents.error ? (
              <p className="text-sm text-red-500">{agents.error}</p>
            ) : !agents.data || agents.data.agents.length === 0 ? (
              <p className="text-sm text-slate-400">No data available</p>
            ) : (
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-slate-50">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Agent</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">
                        Assigned
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">
                        Converted
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAgents.map((agent) => {
                      const rate =
                        agent.total > 0
                          ? ((agent.converted / agent.total) * 100).toFixed(1)
                          : '0.0';
                      return (
                        <tr key={agent.userId} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-medium text-slate-800">{agent.name}</td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {agent.total.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-green-700 font-medium">
                            {agent.converted.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">{rate}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
