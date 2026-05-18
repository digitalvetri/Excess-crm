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
} from 'recharts';
import {
  useFunnel,
  useDailyTrend,
  useSourceBreakdown,
  useAgentPerformance,
  useRevenuePipeline,
} from '@/hooks/use-reports';

const STAGE_COLORS: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  QUALIFIED: 'bg-blue-100 text-blue-700',
  FOLLOW_UP: 'bg-amber-100 text-amber-700',
  CONVERTED: 'bg-green-100 text-green-700',
  NOT_ANSWERED: 'bg-orange-100 text-orange-700',
  INVALID: 'bg-red-100 text-red-700',
  WRONG_ENQUIRY: 'bg-red-100 text-red-700',
};

const PIE_COLORS = ['#0F4C81', '#F39C12', '#27AE60', '#C0392B', '#8E44AD', '#2980B9'];

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
                <Bar dataKey="count" fill="#0F4C81" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
