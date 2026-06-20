'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useLeadStats } from '@/hooks/use-leads';

// Stage chips double as quick filters: clicking one filters the list to that
// stage; clicking the active one clears it. The "All" chip clears the stage filter.
const STAGE_CHIPS: { stage: string; label: string; dot: string; activeRing: string }[] = [
  { stage: '',             label: 'All',          dot: 'bg-slate-400',  activeRing: 'ring-slate-300' },
  { stage: 'NEW',          label: 'New',          dot: 'bg-sky-500',    activeRing: 'ring-sky-300' },
  { stage: 'QUALIFIED',    label: 'Qualified',    dot: 'bg-violet-500', activeRing: 'ring-violet-300' },
  { stage: 'FOLLOW_UP',    label: 'Follow-up',    dot: 'bg-amber-500',  activeRing: 'ring-amber-300' },
  { stage: 'CONVERTED',    label: 'Converted',    dot: 'bg-success',    activeRing: 'ring-emerald-300' },
  { stage: 'NOT_ANSWERED', label: 'Not answered', dot: 'bg-rose-400',   activeRing: 'ring-rose-200' },
];

export function LeadsKpiStrip() {
  const { data, isLoading } = useLeadStats();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeStage = searchParams.get('stage') ?? '';

  function selectStage(stage: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (stage) params.set('stage', stage);
    else params.delete('stage');
    router.push(`${pathname}?${params.toString()}`);
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-white" />
        ))}
      </div>
    );
  }

  const byStage = data?.byStage ?? {};
  const total = data?.totalLeads ?? 0;

  function countFor(stage: string): number {
    if (!stage) return total;
    return byStage[stage] ?? 0;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {STAGE_CHIPS.map((chip) => {
        const isActive = activeStage === chip.stage;
        return (
          <button
            key={chip.stage || 'all'}
            onClick={() => selectStage(chip.stage)}
            aria-pressed={isActive}
            className={`flex flex-col items-start rounded-xl border bg-white px-3 py-2.5 text-left transition-all hover:border-primary/40 hover:shadow-sm ${
              isActive ? `border-primary ring-2 ${chip.activeRing}` : 'border-border'
            }`}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <span className={`h-2 w-2 shrink-0 rounded-full ${chip.dot}`} />
              {chip.label}
            </span>
            <span className="mt-1 text-xl font-bold tabular-nums text-slate-800">
              {countFor(chip.stage).toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
