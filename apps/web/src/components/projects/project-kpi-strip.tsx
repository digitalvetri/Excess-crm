'use client';

import { TrendingUp, Layers, IndianRupee, CheckCircle2, CalendarCheck } from 'lucide-react';
import { useProjectStats, PROJECT_STAGES, STAGE_LABEL, type ProjectStage } from '@/hooks/use-projects';

export function ProjectKpiStrip() {
  const { data: stats, isLoading } = useProjectStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-border bg-white animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const activeCount = PROJECT_STAGES.filter((s) => s !== 'HANDED_OVER').reduce(
    (sum, s) => sum + (stats.byStage[s] ?? 0),
    0,
  );
  const revenueLakh = Number(stats.completedRevenue) / 100000;

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Layers size={18} className="text-primary" />}
          bg="bg-primary/8"
          label="Active Projects"
          value={String(activeCount)}
          sub={`${stats.total} total across all stages`}
        />
        <KpiCard
          icon={<IndianRupee size={18} className="text-success" />}
          bg="bg-success/10"
          label="Revenue Completed"
          value={`₹${revenueLakh.toFixed(1)}L`}
          sub={`${stats.totalCompleted} projects handed over`}
        />
        <KpiCard
          icon={<CalendarCheck size={18} className="text-accent" />}
          bg="bg-accent/10"
          label="Handed Over This Month"
          value={String(stats.completedThisMonth)}
          sub="projects completed"
        />
        <KpiCard
          icon={<TrendingUp size={18} className="text-indigo-500" />}
          bg="bg-indigo-50"
          label="Completion Rate"
          value={stats.total > 0 ? `${Math.round((stats.totalCompleted / stats.total) * 100)}%` : '—'}
          sub={`${stats.totalCompleted} of ${stats.total} projects`}
        />
      </div>

      {/* Stage distribution bar */}
      <StageBar byStage={stats.byStage} total={stats.total} />
    </div>
  );
}

function KpiCard({
  icon,
  bg,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 flex items-start gap-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 truncate">{label}</p>
        <p className="text-xl font-bold text-slate-800 leading-tight">{value}</p>
        <p className="text-[11px] text-slate-400 truncate">{sub}</p>
      </div>
    </div>
  );
}

function StageBar({ byStage, total }: { byStage: Partial<Record<ProjectStage, number>>; total: number }) {
  if (total === 0) return null;

  const STAGE_COLOR: Record<ProjectStage, string> = {
    SURVEY:           'bg-slate-400',
    DESIGN:           'bg-blue-400',
    MATERIAL_ORDERED: 'bg-amber-400',
    INSTALLATION:     'bg-indigo-400',
    COMMISSIONING:    'bg-cyan-400',
    HANDED_OVER:      'bg-success',
  };

  return (
    <div className="rounded-2xl border border-border bg-white px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Stage Distribution</span>
        <span className="text-xs text-slate-400">{total} projects</span>
      </div>
      {/* Segmented bar */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full gap-px">
        {PROJECT_STAGES.map((s) => {
          const count = byStage[s] ?? 0;
          if (count === 0) return null;
          return (
            <div
              key={s}
              style={{ width: `${(count / total) * 100}%` }}
              className={`${STAGE_COLOR[s]} first:rounded-l-full last:rounded-r-full`}
              title={`${STAGE_LABEL[s]}: ${count}`}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {PROJECT_STAGES.map((s) => {
          const count = byStage[s] ?? 0;
          return (
            <div key={s} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${STAGE_COLOR[s]}`} />
              <span className="text-[11px] text-slate-500">
                {STAGE_LABEL[s]}
                <span className="ml-1 font-semibold text-slate-700">{count}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
