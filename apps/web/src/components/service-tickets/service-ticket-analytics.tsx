'use client';

import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from 'recharts';
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval } from 'date-fns';
import { TrendingUp, TrendingDown, Minus, Download } from 'lucide-react';
import {
  useServiceTickets,
  SLA_RESOLVE_HOURS,
  TYPE_LABEL,
  STATUS_LABEL,
  type ServiceTicketListItem,
  type ServiceTicketStatus,
  type ServiceTicketType,
} from '@/hooks/use-service-tickets';

type RangeKey = '7d' | '30d' | '90d';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d',  label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
];

const RANGE_DAYS: Record<RangeKey, number> = { '7d': 7, '30d': 30, '90d': 90 };

const STATUS_COLOR: Record<ServiceTicketStatus, string> = {
  OPEN:        '#F59E0B',
  IN_PROGRESS: '#3B82F6',
  RESOLVED:    '#10B981',
  CLOSED:      '#9CA3AF',
};

const PRIORITY_COLOR: Record<string, string> = {
  P1: '#EF4444',
  P2: '#F97316',
  P3: '#64748B',
  P4: '#CBD5E1',
};

const TYPE_COLORS = ['#0F4C81', '#3B82F6', '#10B981', '#8B5CF6'];

function downloadCsv(tickets: ServiceTicketListItem[]) {
  const header = ['ID', 'Subject', 'Type', 'Priority', 'Status', 'Customer', 'Phone', 'Project', 'Created', 'Resolved', 'SLA Met', 'Engineer ID'];
  const rows = tickets.map((t) => [
    t.id.slice(-8),
    `"${t.subject.replace(/"/g, '""')}"`,
    t.type,
    t.priority,
    t.status,
    `"${t.lead.name.replace(/"/g, '""')}"`,
    t.lead.phone,
    t.project?.number ?? '',
    format(new Date(t.createdAt), 'yyyy-MM-dd HH:mm'),
    t.resolvedAt ? format(new Date(t.resolvedAt), 'yyyy-MM-dd HH:mm') : '',
    (t.status === 'RESOLVED' || t.status === 'CLOSED') ? (isWithinSla(t) ? 'Y' : 'N') : '',
    t.assignedEngineerId ?? '',
  ]);
  const csv  = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `service-tickets-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function pct(num: number, den: number) {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

function delta(curr: number, prev: number): { value: number; dir: 'up' | 'down' | 'flat' } {
  if (prev === 0) return { value: 0, dir: 'flat' };
  const d = Math.round(((curr - prev) / prev) * 100);
  return { value: Math.abs(d), dir: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
}

function isWithinSla(t: ServiceTicketListItem): boolean {
  if (t.status !== 'RESOLVED' && t.status !== 'CLOSED') return false;
  if (!t.resolvedAt) return false;
  const hours = SLA_RESOLVE_HOURS[t.priority] ?? 120;
  const age   = (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000;
  return age <= hours;
}

function KpiCard({
  label,
  value,
  sub,
  prev,
  invertDelta,
}: {
  label: string;
  value: string | number;
  sub?: string;
  prev?: number;
  invertDelta?: boolean;
}) {
  const curr = typeof value === 'number' ? value : undefined;
  const d    = curr !== undefined && prev !== undefined ? delta(curr, prev) : null;

  const icon =
    d === null || d.dir === 'flat' ? <Minus size={12} className="text-slate-400" /> :
    d.dir === 'up' ? <TrendingUp size={12} className={invertDelta ? 'text-danger' : 'text-success'} /> :
    <TrendingDown size={12} className={invertDelta ? 'text-success' : 'text-danger'} />;

  return (
    <div className="bg-white rounded-2xl border border-border p-5">
      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <div className="flex items-center gap-1 mt-1">
        {d && icon}
        {d && <span className="text-xs text-slate-400">{d.value}% vs prev period</span>}
        {!d && sub && <span className="text-xs text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}

export function ServiceTicketAnalytics() {
  const [range, setRange] = useState<RangeKey>('30d');
  const days = RANGE_DAYS[range];

  const now      = new Date();
  const from     = startOfDay(subDays(now, days)).toISOString();
  const to       = endOfDay(now).toISOString();
  const prevFrom = startOfDay(subDays(now, days * 2)).toISOString();
  const prevTo   = startOfDay(subDays(now, days)).toISOString();

  const { data: current, isLoading } = useServiceTickets({ from, to, limit: 2000 });
  const { data: prev }               = useServiceTickets({ from: prevFrom, to: prevTo, limit: 2000 });

  const tickets     = current?.tickets ?? [];
  const prevTickets = prev?.tickets    ?? [];

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total    = tickets.length;
    const open     = tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
    const resolved = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length;
    const slaOk    = tickets.filter(isWithinSla).length;
    const slaPct   = pct(slaOk, resolved);

    const prevTotal    = prevTickets.length;
    const prevOpen     = prevTickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
    const prevResolved = prevTickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length;
    const prevSlaOk    = prevTickets.filter(isWithinSla).length;
    const prevSlaPct   = pct(prevSlaOk, prevResolved);

    return { total, open, resolved, slaPct, prevTotal, prevOpen, prevResolved, prevSlaPct };
  }, [tickets, prevTickets]);

  // ── Daily trend ───────────────────────────────────────────────────────────
  const dailyTrend = useMemo(() => {
    const interval = eachDayOfInterval({ start: subDays(now, days - 1), end: now });
    return interval.map((day) => {
      const label  = format(day, days <= 7 ? 'EEE' : 'MMM d');
      const dayStr = format(day, 'yyyy-MM-dd');
      return {
        date: label,
        Created:  tickets.filter((t) => format(new Date(t.createdAt), 'yyyy-MM-dd') === dayStr).length,
        Resolved: tickets.filter((t) => t.resolvedAt && format(new Date(t.resolvedAt), 'yyyy-MM-dd') === dayStr).length,
      };
    });
  }, [tickets, days]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Status breakdown ──────────────────────────────────────────────────────
  const statusBreakdown = useMemo(() =>
    (['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as ServiceTicketStatus[])
      .map((s) => ({ name: STATUS_LABEL[s], value: tickets.filter((t) => t.status === s).length, color: STATUS_COLOR[s] }))
      .filter((d) => d.value > 0),
  [tickets]);

  // ── Type breakdown ────────────────────────────────────────────────────────
  const typeBreakdown = useMemo(() =>
    (['COMPLAINT', 'AMC_VISIT', 'WARRANTY', 'GENERAL'] as ServiceTicketType[])
      .map((type, i) => ({ name: TYPE_LABEL[type], count: tickets.filter((t) => t.type === type).length, fill: TYPE_COLORS[i] ?? '#9CA3AF' }))
      .filter((d) => d.count > 0),
  [tickets]);

  // ── Priority breakdown ────────────────────────────────────────────────────
  const priorityBreakdown = useMemo(() =>
    ['P1', 'P2', 'P3', 'P4'].map((p) => ({
      priority: p,
      Total:    tickets.filter((t) => t.priority === p).length,
      Open:     tickets.filter((t) => t.priority === p && (t.status === 'OPEN' || t.status === 'IN_PROGRESS')).length,
      fill:     PRIORITY_COLOR[p] ?? '#9CA3AF',
    })).filter((d) => d.Total > 0),
  [tickets]);

  // ── SLA compliance by priority ────────────────────────────────────────────
  const slaByPriority = useMemo(() =>
    ['P1', 'P2', 'P3', 'P4'].map((p) => {
      const done   = tickets.filter((t) => t.priority === p && (t.status === 'RESOLVED' || t.status === 'CLOSED'));
      const withinSla = done.filter(isWithinSla).length;
      return { priority: p, 'SLA %': pct(withinSla, done.length), total: done.length };
    }).filter((d) => d.total > 0),
  [tickets]);

  // ── Engineer workload ─────────────────────────────────────────────────────
  const engineerWorkload = useMemo(() => {
    const map = new Map<string, { name: string; Open: number; Resolved: number }>();
    for (const t of tickets) {
      if (!t.assignedEngineerId) continue;
      const key  = t.assignedEngineerId;
      const name = key.slice(0, 8); // placeholder; real name not in list item
      if (!map.has(key)) map.set(key, { name, Open: 0, Resolved: 0 });
      const entry = map.get(key)!;
      if (t.status === 'RESOLVED' || t.status === 'CLOSED') entry.Resolved++;
      else entry.Open++;
    }
    return [...map.values()].sort((a, b) => (b.Open + b.Resolved) - (a.Open + a.Resolved)).slice(0, 10);
  }, [tickets]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-white rounded-2xl border border-border animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Range selector + CSV export */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                range === r.key ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => downloadCsv(tickets)}
          disabled={tickets.length === 0}
          className="inline-flex items-center gap-1.5 text-sm border border-border px-3 py-1.5 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Tickets"    value={stats.total}    prev={stats.prevTotal}    />
        <KpiCard label="Open / In Progress" value={stats.open}  prev={stats.prevOpen}     invertDelta />
        <KpiCard label="Resolved / Closed" value={stats.resolved} prev={stats.prevResolved} />
        <KpiCard label="SLA Compliance"   value={`${stats.slaPct}%`} sub={`${stats.resolved} resolved`} />
      </div>

      {/* Daily trend */}
      <div className="bg-white rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Daily Trend — Created vs Resolved</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={dailyTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#0F4C81" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#0F4C81" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10B981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="Created"  stroke="#0F4C81" fill="url(#gradCreated)"  strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="Resolved" stroke="#10B981" fill="url(#gradResolved)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Status + Type row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status breakdown */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Status Breakdown</h3>
          {statusBreakdown.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusBreakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={2}>
                  {statusBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Type breakdown */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">By Type</h3>
          {typeBreakdown.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={typeBreakdown} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={80} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {typeBreakdown.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Priority + SLA row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Priority breakdown */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">By Priority</h3>
          {priorityBreakdown.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={priorityBreakdown} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="priority" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Total" radius={[4, 4, 0, 0]}>
                  {priorityBreakdown.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
                <Bar dataKey="Open" fill="#FCD34D" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* SLA compliance by priority */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">SLA Compliance by Priority</h3>
          {slaByPriority.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No resolved tickets</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={slaByPriority} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="priority" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => [`${v}%`, 'SLA compliance']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                <Bar dataKey="SLA %" radius={[4, 4, 0, 0]}>
                  {slaByPriority.map((entry, i) => (
                    <Cell key={i} fill={entry['SLA %'] >= 80 ? '#10B981' : entry['SLA %'] >= 50 ? '#F59E0B' : '#EF4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Engineer workload */}
      {engineerWorkload.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Engineer Workload</h3>
          <ResponsiveContainer width="100%" height={Math.max(160, engineerWorkload.length * 36)}>
            <BarChart data={engineerWorkload} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Open"     stackId="a" fill="#3B82F6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Resolved" stackId="a" fill="#10B981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
