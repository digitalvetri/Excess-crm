'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useSourceBreakdown } from '@/hooks/use-reports';

const COLORS = ['#0B7A3D', '#F39C12', '#0EA5E9', '#8E44AD', '#15A34A', '#64748B'];

export function TopSources() {
  const { data, loading, error } = useSourceBreakdown();
  const sources = data?.sources ?? [];

  const sorted = [...sources].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, 3);
  const restCount = sorted.slice(3).reduce((s, x) => s + x.count, 0);
  const slices =
    restCount > 0 ? [...top, { sourceType: 'Others', count: restCount }] : top;
  const total = slices.reduce((s, x) => s + x.count, 0);

  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <h2 className="mb-4 font-semibold text-slate-800">Top Sources</h2>

      {loading ? (
        <div className="h-[160px] animate-pulse rounded-lg bg-slate-100" />
      ) : error || slices.length === 0 ? (
        <div className="flex h-[160px] items-center justify-center text-sm text-slate-400">
          No source data available
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          {/* Donut chart — centred, constrained so it never overflows */}
          <div className="relative h-[120px] w-[120px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="count"
                  nameKey="sourceType"
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={56}
                  paddingAngle={2}
                  stroke="none"
                >
                  {slices.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold text-slate-800">{total.toLocaleString()}</span>
              <span className="text-[10px] text-slate-400">Total</span>
            </div>
          </div>

          {/* Legend — full width, stacked */}
          <div className="w-full space-y-2">
            {slices.map((s, i) => {
              const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
              return (
                <div key={s.sourceType} className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="flex-1 truncate text-xs text-slate-600">
                    {s.sourceType.replace(/_/g, ' ')}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-slate-500">{pct}%</span>
                  <span className="shrink-0 text-xs text-slate-400 tabular-nums">{s.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
