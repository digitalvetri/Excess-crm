'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { format, addWeeks, startOfWeek, addDays, isToday } from 'date-fns';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, ArrowLeft,
  CalendarClock, User, Loader2, X,
} from 'lucide-react';
import {
  useScheduledTickets,
  useUnscheduledTickets,
  useUpdateServiceTicket,
  useEngineers,
  SLA_RESOLVE_HOURS,
  STATUS_LABEL,
  type ServiceTicketListItem,
  type ServiceTicketStatus,
} from '@/hooks/use-service-tickets';

// ── Priority styling ──────────────────────────────────────────────────────────
const P_BORDER: Record<string, string> = {
  P1: 'border-l-danger',
  P2: 'border-l-amber-500',
  P3: 'border-l-slate-400',
  P4: 'border-l-slate-300',
};
const P_BADGE: Record<string, string> = {
  P1: 'bg-red-100 text-danger',
  P2: 'bg-orange-100 text-orange-700',
  P3: 'bg-slate-100 text-slate-600',
  P4: 'bg-slate-50 text-slate-400',
};
const STATUS_DOT: Record<ServiceTicketStatus, string> = {
  OPEN:        'bg-amber-400',
  IN_PROGRESS: 'bg-blue-400',
  RESOLVED:    'bg-success',
  CLOSED:      'bg-slate-400',
};

// ── Visit card ────────────────────────────────────────────────────────────────
function VisitCard({ ticket }: { ticket: ServiceTicketListItem }) {
  const hours   = SLA_RESOLVE_HOURS[ticket.priority] ?? 120;
  const ageHrs  = (Date.now() - new Date(ticket.createdAt).getTime()) / 3600000;
  const isOver  = ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && ageHrs >= hours;

  return (
    <Link
      href={`/service-tickets/${ticket.id}`}
      className={`block rounded-xl border-l-4 bg-white border border-border px-2.5 py-2 text-left hover:shadow-sm transition-shadow ${P_BORDER[ticket.priority] ?? 'border-l-slate-300'} ${isOver ? 'ring-1 ring-danger/30' : ''}`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${P_BADGE[ticket.priority] ?? 'bg-slate-100 text-slate-500'}`}>
          {ticket.priority}
        </span>
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[ticket.status]}`} />
        {ticket.scheduledVisitAt && (
          <span className="ml-auto text-[10px] text-slate-400">
            {format(new Date(ticket.scheduledVisitAt), 'h:mm a')}
          </span>
        )}
      </div>
      <p className="text-xs font-medium text-slate-800 truncate leading-tight">{ticket.lead.name}</p>
      <p className="text-[11px] text-slate-500 truncate leading-tight">{ticket.subject}</p>
    </Link>
  );
}

// ── Quick-schedule modal ──────────────────────────────────────────────────────
function ScheduleModal({
  ticket,
  onClose,
}: {
  ticket: ServiceTicketListItem;
  onClose: () => void;
}) {
  const modalRef = useFocusTrap(onClose);
  const { data: engineers = [] } = useEngineers();
  const update = useUpdateServiceTicket();

  const [engId,   setEngId]   = useState(ticket.assignedEngineerId ?? '');
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));
  const [time,    setTime]    = useState('09:00');

  async function handleSave() {
    if (!date || !time) { toast.error('Pick a date and time'); return; }
    const scheduledVisitAt = new Date(`${date}T${time}`).toISOString();
    try {
      await update.mutateAsync({
        id:   ticket.id,
        data: {
          scheduledVisitAt,
          ...(engId ? { assignedEngineerId: engId } : {}),
        },
      });
      toast.success('Visit scheduled');
      onClose();
    } catch {
      toast.error('Failed to schedule visit');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Schedule Visit" className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-slate-900">Schedule Visit</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
            <p className="font-medium text-slate-800 truncate">{ticket.subject}</p>
            <p className="text-xs text-slate-500">{ticket.lead.name} · {ticket.lead.phone}</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Engineer</label>
            <select
              value={engId}
              onChange={(e) => setEngId(e.target.value)}
              className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Unassigned</option>
              {engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-sm border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full text-sm border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          <button
            onClick={() => void handleSave()}
            disabled={update.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {update.isPending && <Loader2 size={13} className="animate-spin" />}
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ServiceTicketsSchedulePage() {
  const [weekOffset, setWeekOffset]       = useState(0);
  const [scheduleTarget, setScheduleTarget] = useState<ServiceTicketListItem | null>(null);

  // Week bounds — Mon to Sun
  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekEnd   = addDays(weekStart, 6);
  const weekDays  = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const visitFrom = weekStart.toISOString();
  const visitTo   = new Date(weekEnd.getTime() + 86399999).toISOString(); // end of Sunday

  const { data: scheduled = [], isLoading: loadingSched }      = useScheduledTickets(visitFrom, visitTo);
  const { data: unscheduled = [], isLoading: loadingUnsched }  = useUnscheduledTickets();
  const { data: engineers = [] }                                = useEngineers();

  // Open ticket count per engineer (derived from already-loaded data)
  const openByEng = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of [...unscheduled, ...scheduled]) {
      if (!t.assignedEngineerId) continue;
      if (t.status !== 'OPEN' && t.status !== 'IN_PROGRESS') continue;
      map.set(t.assignedEngineerId, (map.get(t.assignedEngineerId) ?? 0) + 1);
    }
    return map;
  }, [unscheduled, scheduled]);

  // Group scheduled tickets: engineerId → dateKey → tickets[]
  const grid = new Map<string, Map<string, ServiceTicketListItem[]>>();
  const unassignedInWeek: Map<string, ServiceTicketListItem[]> = new Map();

  for (const ticket of scheduled) {
    if (!ticket.scheduledVisitAt) continue;
    const dayKey = ticket.scheduledVisitAt.slice(0, 10);
    const engId  = ticket.assignedEngineerId ?? '__unassigned__';

    if (engId === '__unassigned__') {
      if (!unassignedInWeek.has(dayKey)) unassignedInWeek.set(dayKey, []);
      unassignedInWeek.get(dayKey)!.push(ticket);
    } else {
      if (!grid.has(engId)) grid.set(engId, new Map());
      const dayMap = grid.get(engId)!;
      if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
      dayMap.get(dayKey)!.push(ticket);
    }
  }

  const isLoading = loadingSched || loadingUnsched;

  // Total visits this week per engineer (for workload indicator)
  function visitsThisWeek(engId: string): number {
    const dayMap = grid.get(engId);
    if (!dayMap) return 0;
    return [...dayMap.values()].reduce((acc, arr) => acc + arr.length, 0);
  }

  const unassignedHasAny = unassignedInWeek.size > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/service-tickets" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft size={14} /> Tickets
          </Link>
          <span className="text-slate-300">|</span>
          <h1 className="text-xl font-bold text-slate-900">Engineer Schedule</h1>
        </div>

        {/* Week navigator */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-slate-500 hover:bg-slate-50"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[200px] text-center text-sm font-medium text-slate-700">
            {format(weekStart, 'd MMM')} – {format(weekEnd, 'd MMM yyyy')}
          </span>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-slate-500 hover:bg-slate-50"
          >
            <ChevronRight size={16} />
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Loading schedule…
        </div>
      )}

      {/* Weekly grid */}
      <div className="rounded-2xl border border-border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            {/* Day header */}
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                <th className="w-40 px-4 py-3 text-left text-xs font-semibold text-slate-500 border-r border-border">
                  <div className="flex items-center gap-1.5">
                    <User size={12} /> Engineer
                  </div>
                </th>
                {weekDays.map((day) => (
                  <th
                    key={day.toISOString()}
                    className={`min-w-[140px] px-3 py-3 text-center text-xs font-semibold border-r border-border last:border-r-0 ${
                      isToday(day) ? 'bg-primary/5 text-primary' : 'text-slate-500'
                    }`}
                  >
                    <div className="font-semibold">{format(day, 'EEE')}</div>
                    <div className={`text-base font-bold mt-0.5 ${isToday(day) ? 'text-primary' : 'text-slate-700'}`}>
                      {format(day, 'd')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {/* Engineer rows */}
              {engineers.map((eng) => {
                const total = visitsThisWeek(eng.id);
                const open  = openByEng.get(eng.id) ?? 0;
                const busy  = open >= 5;
                return (
                  <tr key={eng.id}>
                    <td className="px-4 py-3 border-r border-border align-top">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                          {eng.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-700 leading-tight">{eng.name}</p>
                          <p className="text-[11px] text-slate-400">{total} this wk</p>
                          {open > 0 && (
                            <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold mt-0.5 ${busy ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                              {open} open
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    {weekDays.map((day) => {
                      const dayKey  = day.toISOString().slice(0, 10);
                      const visits  = grid.get(eng.id)?.get(dayKey) ?? [];
                      return (
                        <td
                          key={dayKey}
                          className={`px-2 py-2 border-r border-border last:border-r-0 align-top min-h-[80px] ${
                            isToday(day) ? 'bg-primary/[0.02]' : ''
                          }`}
                        >
                          <div className="space-y-1.5">
                            {visits.map((t) => <VisitCard key={t.id} ticket={t} />)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Unassigned row (if any visit has no engineer) */}
              {unassignedHasAny && (
                <tr>
                  <td className="px-4 py-3 border-r border-border align-top">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <User size={12} className="text-amber-600" />
                      </div>
                      <p className="text-xs font-semibold text-amber-700">Unassigned</p>
                    </div>
                  </td>
                  {weekDays.map((day) => {
                    const dayKey = day.toISOString().slice(0, 10);
                    const visits = unassignedInWeek.get(dayKey) ?? [];
                    return (
                      <td key={dayKey} className="px-2 py-2 border-r border-border last:border-r-0 align-top">
                        <div className="space-y-1.5">
                          {visits.map((t) => <VisitCard key={t.id} ticket={t} />)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              )}

              {/* Empty state */}
              {engineers.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    No engineers found. Add ENGINEER role users first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unscheduled tickets — needs date */}
      <div className="rounded-2xl border border-border bg-white">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <CalendarClock size={14} className="text-amber-500" />
            Unscheduled — needs visit date
            {unscheduled.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold px-1.5">
                {unscheduled.length}
              </span>
            )}
          </h2>
        </div>

        {loadingUnsched ? (
          <div className="px-5 py-6 text-sm text-slate-400 flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" /> Loading…
          </div>
        ) : unscheduled.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">
            All active tickets have a visit scheduled.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {unscheduled.map((t) => (
              <div key={t.id} className="flex items-center gap-4 px-5 py-3">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${P_BADGE[t.priority] ?? 'bg-slate-100 text-slate-500'}`}>
                  {t.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <Link href={`/service-tickets/${t.id}`} className="text-sm font-medium text-slate-800 hover:text-primary transition-colors block truncate">
                    {t.subject}
                  </Link>
                  <p className="text-xs text-slate-400 truncate">
                    {t.lead.name}
                    {t.assignedEngineerId
                      ? ` · ${engineers.find((e) => e.id === t.assignedEngineerId)?.name ?? 'Engineer assigned'}`
                      : ' · No engineer'}
                  </p>
                </div>
                <span className={`shrink-0 text-xs text-slate-400 hidden sm:block`}>
                  {STATUS_LABEL[t.status as ServiceTicketStatus]}
                </span>
                <button
                  onClick={() => setScheduleTarget(t)}
                  className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-primary transition-colors"
                >
                  <CalendarClock size={11} /> Schedule
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Schedule modal */}
      {scheduleTarget && (
        <ScheduleModal
          ticket={scheduleTarget}
          onClose={() => setScheduleTarget(null)}
        />
      )}
    </div>
  );
}
