'use client';

import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { Phone, Clock, User } from 'lucide-react';
import { useCalls } from '@/hooks/use-calls';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  QUEUED: { label: 'Queued', className: 'bg-slate-100 text-slate-600' },
  RINGING: { label: 'Ringing', className: 'bg-blue-100 text-blue-600' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-yellow-100 text-yellow-700' },
  COMPLETED: { label: 'Completed', className: 'bg-green-100 text-green-700' },
  NO_ANSWER: { label: 'No Answer', className: 'bg-slate-100 text-slate-500' },
  BUSY: { label: 'Busy', className: 'bg-orange-100 text-orange-600' },
  FAILED: { label: 'Failed', className: 'bg-red-100 text-red-600' },
  DND_BLOCKED: { label: 'DND', className: 'bg-purple-100 text-purple-600' },
};

const PERSONA_LABELS: Record<string, string> = {
  RESHMA_VERIFY: 'Reshma · Verify',
  KARTHIK_SALES: 'Karthik · Sales',
  RESHMA_FOLLOWUP: 'Reshma · Follow-up',
  HUMAN: 'Human',
};

function formatDuration(sec: number | null): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function CallLogTable() {
  const { data, isLoading, isError } = useCalls();

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-border divide-y divide-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 p-4 animate-pulse">
            <div className="w-32 h-4 bg-slate-200 rounded" />
            <div className="flex-1 h-4 bg-slate-100 rounded" />
            <div className="w-20 h-4 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 text-center">
        <p className="text-danger text-sm">Failed to load call log.</p>
      </div>
    );
  }

  const calls = data ?? [];

  if (calls.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-12 text-center">
        <Phone className="mx-auto mb-3 text-slate-300" size={32} />
        <p className="text-slate-500 text-sm">No calls yet. Leads will be dialled automatically.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="hidden md:grid grid-cols-[1fr_160px_120px_100px_80px] gap-4 px-5 py-2 bg-slate-50 border-b border-border text-xs font-medium text-slate-500 uppercase tracking-wide">
        <span>Lead</span>
        <span>Persona</span>
        <span>Status</span>
        <span>Duration</span>
        <span>Time</span>
      </div>

      <div className="divide-y divide-border">
        {calls.map((call) => {
          const statusCfg = STATUS_CONFIG[call.status] ?? { label: call.status, className: 'bg-slate-100 text-slate-600' };
          return (
            <Link
              key={call.id}
              href={`/leads/${call.leadId}`}
              className="grid grid-cols-1 md:grid-cols-[1fr_160px_120px_100px_80px] gap-2 md:gap-4 px-5 py-3 hover:bg-slate-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{call.lead.name}</p>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Phone size={11} /> {call.lead.phone}
                </p>
              </div>

              <div className="flex items-center">
                <span className="text-xs text-slate-600">{PERSONA_LABELS[call.persona] ?? call.persona}</span>
              </div>

              <div className="flex items-center">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.className}`}>
                  {statusCfg.label}
                </span>
              </div>

              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Clock size={11} />
                {formatDuration(call.durationSec)}
              </div>

              <div className="flex items-center text-xs text-slate-400">
                {formatDistanceToNow(new Date(call.initiatedAt), { addSuffix: true })}
              </div>
            </Link>
          );
        })}
      </div>

      {(data?.length ?? 0) > 0 && (
        <div className="px-5 py-3 border-t border-border">
          <button className="text-sm text-primary hover:underline">Load more</button>
        </div>
      )}
    </div>
  );
}
