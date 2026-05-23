'use client';

import Link from 'next/link';
import { Calendar, MapPin, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { useTodayAppointments } from '@/hooks/use-appointments';
import type { AppointmentStatus } from '@/hooks/use-appointments';

const STATUS_STYLE: Record<AppointmentStatus, string> = {
  SCHEDULED:   'bg-sky-100 text-sky-700',
  CONFIRMED:   'bg-primary/10 text-primary',
  COMPLETED:   'bg-success/10 text-success',
  NO_SHOW:     'bg-danger/10 text-danger',
  RESCHEDULED: 'bg-amber-100 text-amber-700',
  CANCELLED:   'bg-slate-100 text-slate-500',
};

export function TodayAppointments() {
  const { data, isLoading } = useTodayAppointments();
  const appts = data ?? [];

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-primary" />
          <h2 className="font-semibold text-slate-800">Today&apos;s Schedule</h2>
          {appts.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {appts.length}
            </span>
          )}
        </div>
        <Link href="/appointments" className="text-sm font-medium text-primary hover:underline">
          View all
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : appts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-12">
          <Calendar size={36} className="mb-2 text-slate-200" />
          <p className="text-sm text-slate-400">No appointments scheduled today</p>
          <Link
            href="/appointments"
            className="mt-3 text-xs font-medium text-primary hover:underline"
          >
            Schedule one →
          </Link>
        </div>
      ) : (
        <div className="flex-1 divide-y divide-border overflow-y-auto">
          {appts.slice(0, 6).map((appt) => (
            <div
              key={appt.id}
              className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-slate-50"
            >
              <div className="flex w-12 shrink-0 flex-col items-center">
                <span className="text-sm font-bold text-slate-800">
                  {format(new Date(appt.scheduledAt), 'HH:mm')}
                </span>
                <span className="text-[10px] text-slate-400">
                  {format(new Date(appt.scheduledAt), 'dd MMM')}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">
                  {appt.lead?.name ?? 'Lead'}
                </p>
                <div className="mt-0.5 flex items-center gap-1">
                  <MapPin size={11} className="shrink-0 text-slate-400" />
                  <span className="truncate text-xs text-slate-400">{appt.siteAddress}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    STATUS_STYLE[appt.status] ?? 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {appt.status.replace(/_/g, ' ')}
                </span>
                <span className="text-[10px] text-slate-400">
                  {appt.surveyType.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          ))}
          {appts.length > 6 && (
            <Link
              href="/appointments"
              className="flex items-center justify-center gap-1 py-3 text-sm font-medium text-primary hover:bg-slate-50"
            >
              +{appts.length - 6} more <ChevronRight size={14} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
