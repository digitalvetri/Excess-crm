'use client';

import { useState, useMemo } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { useAppointments, type Appointment, type AppointmentStatus } from '@/hooks/use-appointments';
import { AppointmentDrawer } from './appointment-drawer';

// ── Colour config ──────────────────────────────────────────────────────────────
const STATUS_DOT: Record<AppointmentStatus, string> = {
  SCHEDULED:   'bg-blue-400',
  CONFIRMED:   'bg-emerald-500',
  COMPLETED:   'bg-slate-400',
  NO_SHOW:     'bg-red-400',
  RESCHEDULED: 'bg-violet-400',
  CANCELLED:   'bg-slate-300',
};

const STATUS_PILL: Record<AppointmentStatus, string> = {
  SCHEDULED:   'bg-blue-100 text-blue-700',
  CONFIRMED:   'bg-emerald-100 text-emerald-700',
  COMPLETED:   'bg-slate-100 text-slate-600',
  NO_SHOW:     'bg-red-100 text-red-700',
  RESCHEDULED: 'bg-violet-100 text-violet-700',
  CANCELLED:   'bg-slate-100 text-slate-400',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Heat colour for capacity heatmap ──────────────────────────────────────────
function heatClass(count: number): string {
  if (count === 0) return '';
  if (count <= 2) return 'bg-primary/8';
  if (count <= 4) return 'bg-primary/15';
  if (count <= 6) return 'bg-primary/25';
  return 'bg-primary/35';
}

// ── Main component ─────────────────────────────────────────────────────────────
export function AppointmentCalendar({
  onAppointmentClick,
}: {
  onAppointmentClick?: (a: Appointment) => void;
}) {
  const [month, setMonth]       = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [drawerAppt, setDrawerAppt]   = useState<Appointment | null>(null);
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [heatmap, setHeatmap]         = useState(true);

  // Fetch the visible calendar range (includes days from prev/next month shown in grid)
  const calStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const calEnd   = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });

  const { data = [], isLoading } = useAppointments({
    from: calStart.toISOString(),
    to:   calEnd.toISOString(),
  });

  // Group appointments by ISO date string (YYYY-MM-DD)
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of data) {
      const key = a.scheduledAt.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return map;
  }, [data]);

  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const selectedKey = selectedDay ? format(selectedDay, 'yyyy-MM-dd') : null;
  const selectedAppts = selectedKey ? (byDay.get(selectedKey) ?? []) : [];

  function openAppt(a: Appointment) {
    if (onAppointmentClick) {
      onAppointmentClick(a);
    } else {
      setDrawerAppt(a);
      setDrawerOpen(true);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Calendar header ── */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="min-w-[160px] text-center text-base font-bold text-slate-800">
            {format(month, 'MMMM yyyy')}
          </h2>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => { setMonth(new Date()); setSelectedDay(new Date()); }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Month total */}
          {!isLoading && (
            <span className="text-sm text-slate-500">
              <span className="font-semibold text-slate-700">{data.length}</span> surveys this month
            </span>
          )}
          {/* Heatmap toggle */}
          <button
            onClick={() => setHeatmap((h) => !h)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              heatmap
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-white text-slate-500'
            }`}
          >
            Heatmap
          </button>
        </div>
      </div>

      {/* ── Calendar grid ── */}
      <div className="rounded-2xl border border-border bg-white overflow-hidden">
        {/* Weekday labels */}
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="py-2.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        {isLoading ? (
          <div className="grid grid-cols-7">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse border-b border-r border-border last:border-r-0 bg-slate-50/50" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key       = format(day, 'yyyy-MM-dd');
              const appts     = byDay.get(key) ?? [];
              const isCurrentMonth = isSameMonth(day, month);
              const isTodayDate    = isToday(day);
              const isSelected     = selectedDay ? isSameDay(day, selectedDay) : false;
              const heat           = heatmap ? heatClass(appts.length) : '';
              const MAX_PILLS      = 3;

              return (
                <button
                  key={key}
                  onClick={() => setSelectedDay(isSameDay(day, selectedDay ?? new Date(-1)) ? null : day)}
                  className={`group min-h-[100px] w-full border-b border-r border-border p-2 text-left transition-all last:border-r-0 hover:bg-slate-50 ${
                    isSelected ? 'ring-2 ring-inset ring-primary/40 bg-primary/5' : heat
                  } ${!isCurrentMonth ? 'opacity-40' : ''}`}
                >
                  {/* Date number */}
                  <div className="mb-1.5 flex items-center justify-between">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                        isTodayDate
                          ? 'bg-primary text-white'
                          : isSelected
                          ? 'bg-primary/20 text-primary'
                          : 'text-slate-700 group-hover:bg-slate-100'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {appts.length > 0 && (
                      <span className="text-[10px] font-medium text-slate-400">
                        {appts.length}
                      </span>
                    )}
                  </div>

                  {/* Appointment pills */}
                  <div className="space-y-0.5">
                    {appts.slice(0, MAX_PILLS).map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-1 overflow-hidden rounded px-1 py-0.5"
                        onClick={(e) => { e.stopPropagation(); openAppt(a); }}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[a.status]}`} />
                        <span className="truncate text-[11px] text-slate-600 leading-tight">
                          {a.lead?.name ?? a.siteAddress.split(',')[0]}
                        </span>
                      </div>
                    ))}
                    {appts.length > MAX_PILLS && (
                      <div className="px-1 text-[11px] font-medium text-primary">
                        +{appts.length - MAX_PILLS} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Selected day detail panel ── */}
      {selectedDay && (
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                isToday(selectedDay) ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                <CalendarIcon size={15} />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  {format(selectedDay, 'EEEE, d MMMM yyyy')}
                </div>
                <div className="text-xs text-slate-400">
                  {selectedAppts.length} survey{selectedAppts.length !== 1 ? 's' : ''}
                  {selectedAppts.filter((a) => !a.assignedEngineerId).length > 0 && (
                    <span className="ml-1 text-amber-500">
                      · {selectedAppts.filter((a) => !a.assignedEngineerId).length} unassigned
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Status breakdown chips */}
            <div className="hidden sm:flex items-center gap-1.5 flex-wrap justify-end">
              {(Object.keys(STATUS_DOT) as AppointmentStatus[]).map((s) => {
                const count = selectedAppts.filter((a) => a.status === s).length;
                if (count === 0) return null;
                return (
                  <span key={s} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[s]}`}>
                    {s.replace('_', '-').toLowerCase()} {count}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Appointments */}
          {selectedAppts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock size={24} className="mb-2 text-slate-300" />
              <p className="text-sm text-slate-400">No surveys scheduled for this day</p>
            </div>
          ) : (
            <div className="p-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {[...selectedAppts]
                  .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                  .map((a) => (
                    <DayApptCard key={a.id} appt={a} onClick={() => openAppt(a)} />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail drawer (when not controlled by parent) */}
      {!onAppointmentClick && (
        <AppointmentDrawer
          appointment={drawerAppt}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

// ── Compact day appointment card ───────────────────────────────────────────────
function DayApptCard({ appt: a, onClick }: { appt: Appointment; onClick: () => void }) {
  const pillClass = STATUS_PILL[a.status];
  const dotClass  = STATUS_DOT[a.status];

  return (
    <button
      onClick={onClick}
      className="group flex items-start gap-3 rounded-xl border border-border bg-white p-3 text-left hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm transition-all"
    >
      {/* Time column */}
      <div className="shrink-0 text-center">
        <div className="text-sm font-bold text-slate-700">
          {format(new Date(a.scheduledAt), 'h:mm')}
        </div>
        <div className="text-[11px] text-slate-400">
          {format(new Date(a.scheduledAt), 'a')}
        </div>
      </div>

      {/* Divider dot */}
      <div className="mt-1.5 flex flex-col items-center">
        <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-800">
          {a.lead?.name ?? '—'}
        </div>
        <div className="mt-0.5 truncate text-xs text-slate-500">{a.siteAddress}</div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${pillClass}`}>
            {a.status.replace('_', '-').toLowerCase()}
          </span>
          <span className="text-[10px] text-slate-400">{a.surveyType}</span>
        </div>
      </div>
    </button>
  );
}
