'use client';

import Link from 'next/link';
import { useFunnel } from '@/hooks/use-reports';

const STAGE_META: Record<string, { label: string; bar: string; badge: string }> = {
  NEW:           { label: 'New',           bar: 'bg-sky-500',   badge: 'bg-sky-100 text-sky-700'     },
  QUALIFIED:     { label: 'Qualified',     bar: 'bg-primary',   badge: 'bg-blue-100 text-primary'    },
  FOLLOW_UP:     { label: 'Follow Up',     bar: 'bg-accent',    badge: 'bg-amber-100 text-amber-700' },
  CONVERTED:     { label: 'Converted',     bar: 'bg-success',   badge: 'bg-green-100 text-success'   },
  NOT_ANSWERED:  { label: 'Not Answered',  bar: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600' },
  INVALID:       { label: 'Invalid',       bar: 'bg-danger',    badge: 'bg-red-100 text-danger'      },
  WRONG_ENQUIRY: { label: 'Wrong Enquiry', bar: 'bg-rose-400',  badge: 'bg-rose-100 text-rose-600'   },
};

const STAGE_ORDER = ['NEW', 'QUALIFIED', 'FOLLOW_UP', 'CONVERTED', 'NOT_ANSWERED', 'INVALID', 'WRONG_ENQUIRY'];

export function PipelineFunnel() {
  const { data, loading } = useFunnel();

  const raw = data?.stages ?? [];
  const stages = STAGE_ORDER.flatMap((s) => {
    const found = raw.find((r) => r.stage === s);
    return found ? [found] : [];
  });
  const max = Math.max(...stages.map((s) => s.count), 1);
  const total = stages.reduce((acc, s) => acc + s.count, 0);

  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-800">Pipeline Funnel</h2>
          {!loading && total > 0 && (
            <p className="mt-0.5 text-xs text-slate-400">{total.toLocaleString()} total leads</p>
          )}
        </div>
        <Link href="/leads" className="text-sm font-medium text-primary hover:underline">
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : stages.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No pipeline data yet.</p>
      ) : (
        <div className="space-y-2.5">
          {stages.map(({ stage, count }) => {
            const meta = STAGE_META[stage] ?? { label: stage, bar: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600' };
            const barPct = max > 0 ? (count / max) * 100 : 0;
            const sharePct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={stage}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-slate-600">{meta.label}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-800">{count.toLocaleString()}</span>
                    <span className={`rounded-full px-1.5 py-0 text-[10px] font-semibold ${meta.badge}`}>
                      {sharePct}%
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${meta.bar}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
