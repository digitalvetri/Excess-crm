'use client';

import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  Area, AreaChart,
} from 'recharts';
import {
  format, subDays, startOfDay, endOfDay, eachDayOfInterval,
  getDay, startOfWeek, endOfWeek,
} from 'date-fns';
import { TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react';
import { useAppointments, type Appointment, type AppointmentStatus } from '@/hooks/use-appointments';
import { useUsers } from '@/hooks/use-teams';

// ── Types ──────────────────────────────────────────────────────────────────────
type RangeKey = '7d' | '30d' | '90d';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d',  label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
];

const RANGE_DAYS: Record<RangeKey, number> = { '7d': 7, '30d': 30, '90d': 90 };

// ── Palette ────────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<AppointmentStatus, string> = {
  SCHEDULED:   '#3B82F6',
  CONFIRMED:   '#10B981',
  COMPLETED:   '#0B7A3D',
  NO_SHOW:     '#EF4444',
  RESCHEDULED: '#8B5CF6',
  CANCELLED:   '#9CA3AF',
};

const SURVEY_COLORS = ['#0B7A3D', '#10B981', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899'];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Helpers ────────────────────────────────────────────────────────────────────
function pct(num: number, den: number) {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

function delta(current: number, prev: number): { value: number; dir: 'up' | 'down' | 'flat' } {
  if (prev === 0) return { value: 0, dir: 'flat' };
  const d = Math.round(((current - prev) / prev) * 100);
  return { value: Math.abs(d), dir: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
}

// ── Main component ─────────────────────────────────────────────────────────────
export function AppointmentReports() {
  const [range, setRange] = useState<RangeKey>('30d');
  const days = RANGE_DAYS[range];

  const now     = new Date();
  const from    = startOfDay(subDays(now, days)).toISOString();
  const to      = endOfDay(now).toISOString();
  const prevFrom = startOfDay(subDays(now, days * 2)).toISOString();
  const prevTo  = startOfDay(subDays(now, days)).toISOString();

  const { data = [], isLoading } = useAppointments({ from, to });
  const { data: prevData = [] }  = useAppointments({ from: prevFrom, to: prevTo });
  const { data: users = [] }     = useUsers();

  const engineers = useMemo(() => users.filter((u) => u.role === 'ENGINEER'), [users]);

  // ── Computed stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total     = data.length;
    const completed = data.filter((a) => a.status === 'COMPLETED').length;
    const noShow    = data.filter((a) => a.status === 'NO_SHOW').length;
    const cancelled = data.filter((a) => a.status === 'CANCELLED').length;
    const active    = total - cancelled;

    const prevTotal     = prevData.length;
    const prevCompleted = prevData.filter((a) => a.status === 'COMPLETED').length;
    const prevNoShow    = prevData.filter((a) => a.status === 'NO_SHOW').length;

    const avgPerDay = days > 0 ? +(total / days).toFixed(1) : 0;

    return {
      total, completed, noShow, cancelled, active,
      completionRate: pct(completed, active),
      noShowRate:     pct(noShow, active),
      avgPerDay,
      prev: { total: prevTotal, completed: prevCompleted, noShow: prevNoShow },
    };
  }, [data, prevData, days]);

  // ── Daily trend ─────────────────────────────────────────────────────────────
  const dailyTrend = useMemo(() => {
    const rangeStart = subDays(now, days - 1);
    const allDays = eachDayOfInterval({ start: rangeStart, end: now });
    return allDays.map((d) => {
      const key = format(d, 'yyyy-MM-dd');
      const dayAppts = data.filter((a) => a.scheduledAt.startsWith(key));
      return {
        date:      days <= 14 ? format(d, 'dd MMM') : format(d, 'd MMM'),
        total:     dayAppts.length,
        completed: dayAppts.filter((a) => a.status === 'COMPLETED').length,
        noShow:    dayAppts.filter((a) => a.status === 'NO_SHOW').length,
      };
    });
  }, [data, days]);

  // ── Status breakdown ────────────────────────────────────────────────────────
  const statusBreakdown = useMemo(() => {
    const counts: Partial<Record<AppointmentStatus, number>> = {};
    for (const a of data) {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
    }
    return (Object.entries(counts) as [AppointmentStatus, number][])
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({
        name: status.replace('_', '-').toLowerCase(),
        value: count,
        color: STATUS_COLOR[status],
      }));
  }, [data]);

  // ── Survey type breakdown ───────────────────────────────────────────────────
  const typeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of data) counts.set(a.surveyType, (counts.get(a.surveyType) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: SURVEY_COLORS[i % SURVEY_COLORS.length]! }));
  }, [data]);

  // ── Engineer performance ────────────────────────────────────────────────────
  const engineerPerf = useMemo(() => {
    return engineers
      .map((e) => {
        const appts     = data.filter((a) => a.assignedEngineerId === e.id);
        const completed = appts.filter((a) => a.status === 'COMPLETED').length;
        const noShow    = appts.filter((a) => a.status === 'NO_SHOW').length;
        const total     = appts.length;
        return {
          id: e.id,
          name: e.name,
          total, completed, noShow,
          rate: pct(completed, total),
        };
      })
      .filter((e) => e.total > 0)
      .sort((a, b) => b.completed - a.completed);
  }, [data, engineers]);

  // ── Day-of-week distribution ────────────────────────────────────────────────
  const dowDistribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const a of data) counts[getDay(new Date(a.scheduledAt))]!++;
    return WEEKDAY_LABELS.map((label, i) => ({ label, count: counts[i] ?? 0 }));
  }, [data]);

  if (isLoading) return <ReportsSkeleton />;

  const totalDelta    = delta(stats.total, stats.prev.total);
  const completedDelta = delta(stats.completionRate, pct(stats.prev.completed, stats.prev.total - prevData.filter(a => a.status === 'CANCELLED').length));

  return (
    <div className="space-y-5">
      {/* ── Range selector ── */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-slate-600">Survey Analytics</h2>
        <div className="flex rounded-xl border border-border bg-white p-1 gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                range === r.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Total Surveys"
          value={stats.total}
          delta={totalDelta}
          icon={<Clock size={18} className="text-blue-500" />}
          iconBg="bg-blue-50"
        />
        <KpiCard
          label="Completion Rate"
          value={`${stats.completionRate}%`}
          delta={completedDelta}
          icon={<CheckCircle2 size={18} className="text-emerald-500" />}
          iconBg="bg-emerald-50"
          sub={`${stats.completed} completed`}
        />
        <KpiCard
          label="No-Show Rate"
          value={`${stats.noShowRate}%`}
          delta={delta(stats.noShowRate, pct(stats.prev.noShow, stats.prev.total))}
          invert
          icon={<XCircle size={18} className="text-red-400" />}
          iconBg="bg-red-50"
          sub={`${stats.noShow} no-shows`}
        />
        <KpiCard
          label="Avg per Day"
          value={stats.avgPerDay}
          icon={<Zap size={18} className="text-amber-500" />}
          iconBg="bg-amber-50"
          sub={`over ${days} days`}
        />
      </div>

      {/* ── Charts row 1: daily trend + status breakdown ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Daily trend (spans 2 cols) */}
        <div className="rounded-2xl border border-border bg-white p-5 lg:col-span-2">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Survey Trend</h3>
            <p className="text-xs text-slate-400">Total vs completed over time</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#0B7A3D" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#0B7A3D" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={false}
                interval={days <= 14 ? 0 : Math.floor(days / 10)}
              />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }}
                itemStyle={{ color: '#475569' }}
              />
              <Area dataKey="total"     name="Total"     type="monotone" stroke="#3B82F6" strokeWidth={2} fill="url(#totalGrad)" dot={false} />
              <Area dataKey="completed" name="Completed" type="monotone" stroke="#0B7A3D" strokeWidth={2} fill="url(#completedGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Status breakdown donut */}
        <div className="rounded-2xl border border-border bg-white p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-700">By Status</h3>
            <p className="text-xs text-slate-400">{stats.total} total surveys</p>
          </div>
          {statusBreakdown.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={statusBreakdown}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {statusBreakdown.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }}
                  formatter={(value, name) => [value, (name as string)]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span style={{ fontSize: 11, color: '#64748B' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Charts row 2: engineer perf + day-of-week + survey type ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Engineer performance */}
        <div className="rounded-2xl border border-border bg-white p-5 lg:col-span-2">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Engineer Performance</h3>
            <p className="text-xs text-slate-400">Surveys assigned and completion rates</p>
          </div>
          {engineerPerf.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-slate-400">
              No engineer data for this period
            </div>
          ) : (
            <div className="space-y-3">
              {engineerPerf.map((e) => (
                <div key={e.id} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 truncate text-sm font-medium text-slate-700">{e.name}</div>
                  <div className="flex flex-1 gap-px overflow-hidden rounded-full" style={{ height: 10 }}>
                    <div
                      title={`Completed: ${e.completed}`}
                      style={{ width: `${pct(e.completed, e.total)}%`, background: '#0B7A3D' }}
                      className="transition-all"
                    />
                    <div
                      title={`No-show: ${e.noShow}`}
                      style={{ width: `${pct(e.noShow, e.total)}%`, background: '#EF4444' }}
                    />
                    <div
                      style={{ flex: 1, background: '#E2E8F0' }}
                    />
                  </div>
                  <div className="w-16 shrink-0 text-right text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{e.rate}%</span>
                    {' '}done
                  </div>
                  <div className="w-12 shrink-0 text-right text-xs text-slate-400">
                    {e.total} total
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Survey type breakdown */}
        <div className="rounded-2xl border border-border bg-white p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Survey Types</h3>
            <p className="text-xs text-slate-400">Distribution by category</p>
          </div>
          {typeBreakdown.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-slate-400">No data</div>
          ) : (
            <div className="space-y-2.5">
              {typeBreakdown.map((t) => (
                <div key={t.name} className="flex items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: t.color }}
                  />
                  <span className="flex-1 truncate text-sm text-slate-600">{t.name}</span>
                  <span className="text-sm font-semibold text-slate-700">{t.value}</span>
                  <div className="w-16 overflow-hidden rounded-full bg-slate-100" style={{ height: 5 }}>
                    <div
                      style={{
                        width: `${pct(t.value, stats.total)}%`,
                        background: t.color,
                        height: '100%',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Day-of-week heatmap ── */}
      <div className="rounded-2xl border border-border bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Busiest Days of Week</h3>
            <p className="text-xs text-slate-400">Survey volume by weekday</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={dowDistribution} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748B' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }}
              cursor={{ fill: '#F8FAFC' }}
            />
            <Bar dataKey="count" name="Surveys" radius={[5, 5, 0, 0]}>
              {dowDistribution.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.count === Math.max(...dowDistribution.map((d) => d.count)) ? '#0B7A3D' : '#CBD5E1'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: { value: number; dir: 'up' | 'down' | 'flat' };
  invert?: boolean;
  icon: React.ReactNode;
  iconBg: string;
  sub?: string;
}

function KpiCard({ label, value, delta: d, invert = false, icon, iconBg, sub }: KpiCardProps) {
  const isGood = d ? (invert ? d.dir === 'down' : d.dir === 'up') : null;

  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className={`rounded-xl p-2 ${iconBg}`}>{icon}</div>
        {d && d.dir !== 'flat' && (
          <span
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              isGood ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
            }`}
          >
            {d.dir === 'up' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {d.value}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        <div className="mt-0.5 text-xs font-medium text-slate-500">{label}</div>
        {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
      </div>
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────
function ReportsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <div className="h-8 w-64 animate-pulse rounded-xl bg-slate-100" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 h-64 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    </div>
  );
}
