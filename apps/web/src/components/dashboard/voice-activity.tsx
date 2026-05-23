'use client';

import { Bot, PhoneCall, Mic } from 'lucide-react';
import { useCallAnalytics } from '@/hooks/use-reports';

const PERSONA_COLORS: Record<string, string> = {
  'Reshma-Verify':   'bg-primary',
  'Karthik-Sales':   'bg-accent',
  'Reshma-FollowUp': 'bg-success',
};

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VoiceActivity() {
  const { data, loading } = useCallAnalytics();

  const personas = data?.byPersona ?? [];
  const totalCalls = data?.totalCalls ?? 0;
  const connectRate = data?.connectRate ?? 0;
  const avgDur = data?.avgDurationSec ?? 0;
  const maxPersonaTotal = Math.max(...personas.map((p) => p.total), 1);

  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Bot size={16} className="text-primary" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-800">AI Voice Agent</h2>
          <p className="text-[11px] text-slate-400">This month</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-3 divide-x divide-border rounded-lg border border-border">
            <div className="px-3 py-2.5 text-center">
              <div className="flex items-center justify-center gap-1">
                <PhoneCall size={13} className="text-primary" />
                <span className="text-lg font-bold text-slate-800">{totalCalls.toLocaleString()}</span>
              </div>
              <p className="mt-0.5 text-[10px] text-slate-400">Total Calls</p>
            </div>
            <div className="px-3 py-2.5 text-center">
              <span className="text-lg font-bold text-slate-800">{connectRate}%</span>
              <p className="mt-0.5 text-[10px] text-slate-400">Connect Rate</p>
            </div>
            <div className="px-3 py-2.5 text-center">
              <div className="flex items-center justify-center gap-1">
                <Mic size={13} className="text-success" />
                <span className="text-lg font-bold text-slate-800">{fmtDuration(avgDur)}</span>
              </div>
              <p className="mt-0.5 text-[10px] text-slate-400">Avg Duration</p>
            </div>
          </div>

          {personas.length > 0 ? (
            <div className="space-y-3">
              {personas.map((p) => {
                const barColor = PERSONA_COLORS[p.persona] ?? 'bg-slate-400';
                const pct = maxPersonaTotal > 0 ? (p.total / maxPersonaTotal) * 100 : 0;
                return (
                  <div key={p.persona}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-slate-600">{p.persona.replace(/-/g, ' ')}</span>
                      <span className="font-semibold text-slate-700">
                        {p.total} <span className="font-normal text-slate-400">({p.connectRate}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-slate-400">No AI call data available</p>
          )}
        </>
      )}
    </div>
  );
}
