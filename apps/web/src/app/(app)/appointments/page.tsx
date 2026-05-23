'use client';

import { useState, useMemo } from 'react';
import { format, isToday, isTomorrow, isThisWeek } from 'date-fns';
import { Calendar, Plus, Search, SlidersHorizontal, LayoutList, GanttChart, Map as MapIcon, CalendarDays, BarChart2 } from 'lucide-react';
import { useAppointments, type Appointment, type AppointmentStatus } from '@/hooks/use-appointments';
import { TodaySummaryBar } from '@/components/appointments/today-summary-bar';
import { AppointmentCard } from '@/components/appointments/appointment-card';
import { AppointmentDrawer } from '@/components/appointments/appointment-drawer';
import { BookSurveyDrawer } from '@/components/appointments/book-survey-drawer';
import { DispatchBoard } from '@/components/appointments/dispatch-board';
import { AppointmentMap } from '@/components/appointments/appointment-map';
import { AppointmentCalendar } from '@/components/appointments/appointment-calendar';
import { AppointmentReports } from '@/components/appointments/appointment-reports';

type ViewMode = 'list' | 'dispatch' | 'map' | 'calendar' | 'reports';

const STATUS_TABS: { value: AppointmentStatus | 'ALL'; label: string }[] = [
  { value: 'ALL',        label: 'All' },
  { value: 'SCHEDULED',  label: 'Scheduled' },
  { value: 'CONFIRMED',  label: 'Confirmed' },
  { value: 'COMPLETED',  label: 'Completed' },
  { value: 'NO_SHOW',    label: 'No-Show' },
  { value: 'CANCELLED',  label: 'Cancelled' },
];

function dateGroupLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d))    return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  if (isThisWeek(d)) return format(d, 'EEEE');
  return format(d, 'd MMMM yyyy');
}

function groupByDate(appointments: Appointment[]): { label: string; items: Appointment[] }[] {
  const map = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const key = a.scheduledAt.slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(a);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([, items]) => ({
    label: dateGroupLabel(items[0]!.scheduledAt),
    items,
  }));
}

export default function AppointmentsPage() {
  const [view, setView]             = useState<ViewMode>('list');
  const [statusTab, setStatusTab]   = useState<AppointmentStatus | 'ALL'>('ALL');
  const [search, setSearch]         = useState('');
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bookOpen, setBookOpen]     = useState(false);

  const { data, isLoading, isError } = useAppointments(
    statusTab !== 'ALL' ? { status: statusTab } : {},
  );

  const filtered = useMemo(() => {
    const raw = data ?? [];
    if (!search.trim()) return raw;
    const q = search.toLowerCase();
    return raw.filter(
      (a) =>
        a.lead?.name.toLowerCase().includes(q) ||
        a.siteAddress.toLowerCase().includes(q) ||
        a.lead?.phone.includes(q),
    );
  }, [data, search]);

  const groups   = useMemo(() => groupByDate(filtered), [filtered]);

  const tabCounts = useMemo(() => {
    const all = data ?? [];
    return {
      SCHEDULED:   all.filter((a) => a.status === 'SCHEDULED').length,
      CONFIRMED:   all.filter((a) => a.status === 'CONFIRMED').length,
      COMPLETED:   all.filter((a) => a.status === 'COMPLETED').length,
      NO_SHOW:     all.filter((a) => a.status === 'NO_SHOW').length,
      RESCHEDULED: all.filter((a) => a.status === 'RESCHEDULED').length,
      CANCELLED:   all.filter((a) => a.status === 'CANCELLED').length,
    };
  }, [data]);

  function openDrawer(a: Appointment) {
    setSelectedAppt(a);
    setDrawerOpen(true);
  }

  return (
    <>
      <div className="space-y-5">
        {/* ── Page header ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
            <p className="mt-0.5 text-sm text-slate-500">Solar site survey scheduling &amp; dispatch.</p>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-xl border border-border bg-white p-1 gap-1">
              <button
                onClick={() => setView('list')}
                title="List view"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === 'list'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <LayoutList size={15} />
                <span className="hidden sm:inline">List</span>
              </button>
              <button
                onClick={() => setView('dispatch')}
                title="Dispatch board"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === 'dispatch'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <GanttChart size={15} />
                <span className="hidden sm:inline">Dispatch</span>
              </button>
              <button
                onClick={() => setView('map')}
                title="Map view"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === 'map'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <MapIcon size={15} />
                <span className="hidden sm:inline">Map</span>
              </button>
              <button
                onClick={() => setView('calendar')}
                title="Calendar view"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === 'calendar'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <CalendarDays size={15} />
                <span className="hidden sm:inline">Calendar</span>
              </button>
              <button
                onClick={() => setView('reports')}
                title="Reports"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === 'reports'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <BarChart2 size={15} />
                <span className="hidden sm:inline">Reports</span>
              </button>
            </div>

            <button
              onClick={() => setBookOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
            >
              <Plus size={16} />
              New Survey
            </button>
          </div>
        </div>

        {/* ── Today summary bar (both views) ── */}
        <TodaySummaryBar />

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* DISPATCH BOARD VIEW                                               */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view === 'dispatch' && (
          <DispatchBoard onAppointmentClick={openDrawer} />
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* MAP VIEW                                                          */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view === 'map' && (
          <AppointmentMap />
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* CALENDAR VIEW                                                     */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view === 'calendar' && (
          <AppointmentCalendar onAppointmentClick={openDrawer} />
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* REPORTS VIEW                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view === 'reports' && (
          <AppointmentReports />
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* LIST VIEW                                                         */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view === 'list' && (
          <>
            {/* Filter bar */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, address..."
                  className="w-full rounded-xl border border-border bg-white py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <button className="flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                <SlidersHorizontal size={14} />
                Filters
              </button>
            </div>

            {/* Status tabs */}
            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {STATUS_TABS.map((tab) => {
                const count =
                  tab.value === 'ALL'
                    ? (data?.length ?? 0)
                    : (tabCounts[tab.value as AppointmentStatus] ?? 0);
                const active = statusTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setStatusTab(tab.value)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-white border border-border text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                    {count > 0 && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Card list */}
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-white" />
                ))}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-white py-16 text-center">
                <p className="text-sm font-medium text-danger">Failed to load appointments.</p>
                <p className="mt-1 text-xs text-slate-400">Check your connection and try again.</p>
              </div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-white py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                  <Calendar size={26} className="text-slate-400" />
                </div>
                <p className="text-base font-semibold text-slate-600">No appointments found</p>
                <p className="mt-1 text-sm text-slate-400">
                  {search ? 'Try a different search term.' : 'Book the first site survey to get started.'}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {groups.map((group) => (
                  <div key={group.label}>
                    <div className="mb-3 flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-500">{group.label}</span>
                      <span className="text-xs text-slate-400">
                        {format(new Date(group.items[0]!.scheduledAt), 'd MMM')}
                        {' · '}
                        {group.items.length} survey{group.items.length !== 1 ? 's' : ''}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <div className="space-y-2.5">
                      {group.items.map((appt) => (
                        <AppointmentCard
                          key={appt.id}
                          appointment={appt}
                          onClick={() => openDrawer(appt)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Detail drawer ── */}
      <AppointmentDrawer
        appointment={selectedAppt}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* ── Book survey drawer ── */}
      <BookSurveyDrawer
        open={bookOpen}
        onClose={() => setBookOpen(false)}
      />
    </>
  );
}
