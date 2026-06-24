'use client';

import Link from 'next/link';
import { Sparkles, Flame, Clock, TrendingUp } from 'lucide-react';
import { useDailyBrief } from '@/hooks/use-insights';

// AI morning briefing — "your day" in one card. Always renders (deterministic brief
// if AI is off); hides only on a hard error.
export function DailyBriefCard() {
  const { data, isLoading } = useDailyBrief();

  if (isLoading) {
    return <div className="h-28 rounded-2xl border border-primary/15 bg-primary/5 animate-pulse" />;
  }
  if (!data) return null;

  const s = data.stats;
  const chips = [
    { icon: Flame, label: `${s.hot} hot`, tone: 'text-rose-600 bg-rose-50' },
    { icon: Clock, label: `${s.overdue} overdue`, tone: 'text-amber-700 bg-amber-50' },
    { icon: TrendingUp, label: `${s.qualified + s.followUp} in pipeline`, tone: 'text-primary bg-primary/10' },
  ];

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-white p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-primary">
          <Sparkles size={14} />
        </span>
        <h3 className="text-sm font-semibold text-slate-800">Your day</h3>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c.label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${c.tone}`}>
              <c.icon size={11} /> {c.label}
            </span>
          ))}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-slate-700">{data.brief}</p>

      {data.hotLeads.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {data.hotLeads.slice(0, 4).map((l) => (
            <Link
              key={l.id}
              href={`/leads/${l.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-primary/40 transition-colors"
            >
              <span className="font-medium">{l.name}</span>
              <span className="text-slate-400">· {l.stage.replace('_', ' ').toLowerCase()}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
