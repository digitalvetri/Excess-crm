'use client';

import { CheckCircle2, Clock, AlertTriangle, XCircle, Calendar, UserX } from 'lucide-react';
import { useTodayAppointments, type AppointmentStatus } from '@/hooks/use-appointments';

interface StatChip {
  label: string;
  status: string;
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
  count: number;
}

export function TodaySummaryBar() {
  const { data, isLoading } = useTodayAppointments();

  const appointments = data ?? [];
  const total = appointments.length;
  const scheduled = appointments.filter((a) => a.status === 'SCHEDULED').length;
  const confirmed = appointments.filter((a) => a.status === 'CONFIRMED').length;
  const completed = appointments.filter((a) => a.status === 'COMPLETED').length;
  const noShow = appointments.filter((a) => a.status === 'NO_SHOW').length;
  const unassigned = appointments.filter(
    (a) => !a.assignedEngineerId && !['COMPLETED', 'CANCELLED'].includes(a.status),
  ).length;

  if (isLoading) {
    return (
      <div className="h-14 rounded-xl bg-white border border-border animate-pulse" />
    );
  }

  if (total === 0) return null;

  const chips: StatChip[] = [
    {
      label: 'Total',
      status: 'TOTAL',
      icon: Calendar,
      colorClass: 'text-slate-700',
      bgClass: 'bg-slate-100',
      count: total,
    },
    {
      label: 'Completed',
      status: 'COMPLETED',
      icon: CheckCircle2,
      colorClass: 'text-emerald-700',
      bgClass: 'bg-emerald-50',
      count: completed,
    },
    {
      label: 'Confirmed',
      status: 'CONFIRMED',
      icon: Clock,
      colorClass: 'text-blue-700',
      bgClass: 'bg-blue-50',
      count: confirmed,
    },
    {
      label: 'Scheduled',
      status: 'SCHEDULED',
      icon: Calendar,
      colorClass: 'text-indigo-700',
      bgClass: 'bg-indigo-50',
      count: scheduled,
    },
    {
      label: 'No-Show',
      status: 'NO_SHOW',
      icon: UserX,
      colorClass: 'text-rose-700',
      bgClass: 'bg-rose-50',
      count: noShow,
    },
    {
      label: 'Unassigned',
      status: 'UNASSIGNED',
      icon: AlertTriangle,
      colorClass: 'text-amber-700',
      bgClass: 'bg-amber-50',
      count: unassigned,
    },
  ].filter((c) => c.count > 0 || c.status === 'TOTAL');

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-3 flex-wrap">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
        Today
      </span>
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <div
            key={chip.status}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${chip.bgClass} ${chip.colorClass}`}
          >
            <Icon size={14} />
            <span>{chip.count}</span>
            <span className="text-xs font-normal opacity-80">{chip.label}</span>
            {chip.status === 'UNASSIGNED' && chip.count > 0 && (
              <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            )}
          </div>
        );
      })}
    </div>
  );
}
