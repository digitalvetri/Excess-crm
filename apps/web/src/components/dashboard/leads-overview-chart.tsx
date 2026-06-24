'use client';

import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useDailyTrend } from '@/hooks/use-reports';

export function LeadsOverview() {
  const { data, loading, error } = useDailyTrend();
  const trend = data ?? [];
  const total = trend.reduce((s, d) => s + d.count, 0);

  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Leads Overview</h2>
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
          Last 14 days
        </span>
      </div>
      <p className="mb-4 text-sm text-slate-400">{total.toLocaleString()} leads received</p>

      {loading ? (
        <div className="h-[180px] animate-pulse rounded-lg bg-slate-100" />
      ) : error || trend.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-sm text-slate-400">
          No lead data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#15A34A" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#15A34A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f0" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={(v: string) => v.slice(5)}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#0B7A3D"
              strokeWidth={2.5}
              fill="url(#leadsGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
