'use client';

import {
  useState, useRef, useCallback, useEffect, useMemo,
} from 'react';
import { format, addDays, subDays, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, AlertTriangle, Users, Loader2 } from 'lucide-react';
import { useAppointments, useReassignAppointment, type Appointment } from '@/hooks/use-appointments';
import { useUsers, type CrmUser } from '@/hooks/use-teams';
import { STATUS_CONFIG, SURVEY_CONFIG } from './appointment-drawer';

// ─── Layout constants ─────────────────────────────────────────────────────────

const HOUR_PX = 130;
const ROW_H = 72;
const LABEL_W = 176;
const BIZ_START = 9;
const BIZ_END = 19;
const TOTAL_HOURS = BIZ_END - BIZ_START;
const GRID_W = TOTAL_HOURS * HOUR_PX;

// Survey type → block colour
const BLOCK_COLORS: Record<string, string> = {
  ROOFTOP_RESIDENTIAL: 'bg-sky-500 border-sky-600',
  COMMERCIAL:          'bg-violet-500 border-violet-600',
  INDUSTRIAL:          'bg-amber-500 border-amber-600',
  OFFGRID:             'bg-emerald-500 border-emerald-600',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function blockLeft(scheduledAt: string): number {
  const d = new Date(scheduledAt);
  const h = d.getHours() + d.getMinutes() / 60;
  const clamped = Math.max(BIZ_START, Math.min(BIZ_END, h));
  return (clamped - BIZ_START) * HOUR_PX;
}

function blockWidth(durationMin: number): number {
  return Math.max(32, (durationMin / 60) * HOUR_PX);
}

function currentTimeLeft(): number {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  return (h - BIZ_START) * HOUR_PX;
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// ─── Time Axis ────────────────────────────────────────────────────────────────

function TimeAxis() {
  return (
    <div className="relative h-8 shrink-0" style={{ width: GRID_W }}>
      {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => {
        const hour = BIZ_START + i;
        return (
          <div
            key={i}
            className="absolute top-0 flex flex-col items-center"
            style={{ left: i * HOUR_PX - 20, width: 40 }}
          >
            <span className="text-[11px] font-semibold text-slate-500">
              {hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Grid lines ───────────────────────────────────────────────────────────────

function GridLines() {
  return (
    <div className="pointer-events-none absolute inset-0" style={{ width: GRID_W }}>
      {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => (
        <div
          key={i}
          className={`absolute top-0 bottom-0 ${i === 0 ? 'w-px bg-border' : 'w-px bg-border/60'}`}
          style={{ left: i * HOUR_PX }}
        />
      ))}
      {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
        <div
          key={`half-${i}`}
          className="absolute top-0 bottom-0 w-px bg-border/30"
          style={{ left: i * HOUR_PX + HOUR_PX / 2 }}
        />
      ))}
    </div>
  );
}

// ─── Travel indicator (dashed arrow between consecutive appts) ────────────────

interface TravelIndicatorProps {
  fromAppt: Appointment;
  toAppt: Appointment;
}

function TravelIndicator({ fromAppt, toAppt }: TravelIndicatorProps) {
  const fromEnd = blockLeft(fromAppt.scheduledAt) + blockWidth(fromAppt.durationMin);
  const toStart = blockLeft(toAppt.scheduledAt);
  const gapPx = toStart - fromEnd;
  if (gapPx < 4) return null;

  const gapMinutes = (new Date(toAppt.scheduledAt).getTime() - new Date(fromAppt.scheduledAt).getTime()) / 60000 - fromAppt.durationMin;
  if (gapMinutes > 120) return null;

  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 flex items-center"
      style={{ left: fromEnd + 2, width: gapPx - 4 }}
    >
      <div className="flex-1 border-t-2 border-dashed border-slate-300" />
      <span className="shrink-0 text-[9px] text-slate-300 px-0.5">
        {Math.round(gapMinutes)}m
      </span>
    </div>
  );
}

// ─── Appointment Block ────────────────────────────────────────────────────────

interface BlockProps {
  appt: Appointment;
  isDragging: boolean;
  onClick: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
}

function AppointmentBlock({ appt, isDragging, onClick, onPointerDown }: BlockProps) {
  const left = blockLeft(appt.scheduledAt);
  const width = blockWidth(appt.durationMin);
  const colorClass = BLOCK_COLORS[appt.surveyType] ?? 'bg-slate-500 border-slate-600';
  const surveyCfg = SURVEY_CONFIG[appt.surveyType];
  const statusCfg = STATUS_CONFIG[appt.status];
  const isTerminal = appt.status === 'COMPLETED' || appt.status === 'CANCELLED' || appt.status === 'NO_SHOW';
  const isConfirmed = appt.status === 'CONFIRMED';

  return (
    <div
      className={`absolute top-2 bottom-2 rounded-lg border text-white select-none transition-shadow
        ${colorClass}
        ${isTerminal ? 'opacity-40' : 'opacity-100'}
        ${isDragging ? 'opacity-70 shadow-2xl ring-2 ring-white/60 cursor-grabbing z-30' : 'cursor-grab hover:shadow-lg hover:brightness-110 z-10'}
      `}
      style={{ left, width }}
      onClick={(e) => { e.stopPropagation(); if (!isDragging) onClick(); }}
      onPointerDown={onPointerDown}
    >
      <div className="flex h-full flex-col justify-between px-2 py-1.5 overflow-hidden">
        {/* Top row: icon + status dot */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm leading-none">{surveyCfg?.icon ?? '📋'}</span>
          {isConfirmed && (
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
          )}
        </div>
        {/* Lead name */}
        {width >= 80 && (
          <p className="truncate text-[11px] font-semibold leading-tight">
            {appt.lead?.name ?? '—'}
          </p>
        )}
        {/* Time + duration */}
        {width >= 100 && (
          <p className="text-[10px] opacity-80 leading-tight">
            {format(new Date(appt.scheduledAt), 'h:mm a')} · {appt.durationMin}m
          </p>
        )}
      </div>

      {/* Status ribbon on left edge */}
      <div className={`absolute left-0 top-2 bottom-2 w-1 rounded-l-lg ${statusCfg?.dotClass ?? 'bg-white/40'}`} />
    </div>
  );
}

// ─── Engineer Row ─────────────────────────────────────────────────────────────

interface EngineerRowProps {
  engineer: CrmUser | null;
  appointments: Appointment[];
  isDropTarget: boolean;
  draggingId: string | null;
  onBlockClick: (a: Appointment) => void;
  onPointerDown: (e: React.PointerEvent, a: Appointment) => void;
  rowIndex: number;
}

function EngineerRow({
  engineer, appointments, isDropTarget, draggingId,
  onBlockClick, onPointerDown, rowIndex,
}: EngineerRowProps) {
  const sorted = [...appointments].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );

  const isUnassigned = engineer === null;

  return (
    <div
      className={`flex border-b border-border transition-colors ${
        isDropTarget ? 'bg-primary/8' : isUnassigned ? 'bg-amber-50/60' : rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
      }`}
      style={{ height: ROW_H }}
    >
      {/* Engineer label */}
      <div
        className="shrink-0 flex items-center gap-2.5 px-3 border-r border-border"
        style={{ width: LABEL_W }}
      >
        {isUnassigned ? (
          <>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle size={14} className="text-amber-500" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-700">Unassigned</p>
              {appointments.length > 0 && (
                <p className="text-[10px] text-amber-500">{appointments.length} needs engineer</p>
              )}
            </div>
          </>
        ) : (
          <>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {initials(engineer.name)}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{engineer.name.split(' ')[0]}</p>
              <p className="text-[10px] text-slate-400">{appointments.length} surveys</p>
            </div>
          </>
        )}

        {isDropTarget && (
          <span className="ml-auto h-2 w-2 rounded-full bg-primary animate-pulse" />
        )}
      </div>

      {/* Timeline area */}
      <div className="relative flex-shrink-0 overflow-visible" style={{ width: GRID_W }}>
        <GridLines />

        {/* Travel indicators */}
        {sorted.map((appt, i) => {
          if (i === 0) return null;
          return (
            <TravelIndicator key={`travel-${appt.id}`} fromAppt={sorted[i - 1]!} toAppt={appt} />
          );
        })}

        {/* Appointment blocks */}
        {sorted.map((appt) => (
          <AppointmentBlock
            key={appt.id}
            appt={appt}
            isDragging={draggingId === appt.id}
            onClick={() => onBlockClick(appt)}
            onPointerDown={(e) => onPointerDown(e, appt)}
          />
        ))}

        {/* Empty hint */}
        {appointments.length === 0 && !isDropTarget && (
          <div className="absolute inset-0 flex items-center pl-4">
            <span className="text-[11px] text-slate-300">No surveys scheduled</span>
          </div>
        )}

        {/* Drop target hint */}
        {isDropTarget && (
          <div className="absolute inset-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 flex items-center justify-center pointer-events-none">
            <span className="text-xs font-semibold text-primary/60">Drop to reassign</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Current time indicator ───────────────────────────────────────────────────

function CurrentTimeIndicator({ dateStr }: { dateStr: string }) {
  const [left, setLeft] = useState(currentTimeLeft);

  useEffect(() => {
    const today = isToday(new Date(dateStr));
    if (!today) return;
    const id = setInterval(() => setLeft(currentTimeLeft()), 60_000);
    return () => clearInterval(id);
  }, [dateStr]);

  if (!isToday(new Date(dateStr))) return null;
  if (left < 0 || left > GRID_W) return null;

  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 z-20 flex flex-col items-center"
      style={{ left: LABEL_W + left - 1 }}
    >
      <div className="h-full w-0.5 bg-danger opacity-70" />
      <div className="-mt-1 h-2 w-2 rounded-full bg-danger" />
    </div>
  );
}

// ─── Day Navigation ───────────────────────────────────────────────────────────

interface DayNavProps {
  date: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

function DayNav({ date, onPrev, onNext, onToday }: DayNavProps) {
  const todayActive = isToday(date);
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onPrev}
        className="rounded-lg border border-border bg-white p-1.5 text-slate-500 hover:bg-slate-50 transition-colors"
      >
        <ChevronLeft size={15} />
      </button>
      <button
        onClick={onToday}
        className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
          todayActive ? 'border-primary bg-primary text-white' : 'border-border bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        Today
      </button>
      <span className="min-w-[140px] text-center text-sm font-semibold text-slate-700">
        {format(date, 'EEE, d MMM yyyy')}
      </span>
      <button
        onClick={onNext}
        className="rounded-lg border border-border bg-white p-1.5 text-slate-500 hover:bg-slate-50 transition-colors"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

// ─── Main DispatchBoard ───────────────────────────────────────────────────────

interface DispatchBoardProps {
  onAppointmentClick: (a: Appointment) => void;
}

export function DispatchBoard({ onAppointmentClick }: DispatchBoardProps) {
  const [boardDate, setBoardDate] = useState(() => new Date());
  const boardRef = useRef<HTMLDivElement>(null);

  // Dragging state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropEngineerIdx, setDropEngineerIdx] = useState<number | null>(null);
  const dragApptRef = useRef<Appointment | null>(null);
  const { mutate: reassign } = useReassignAppointment();

  // Date range for the board day (IST midnight → next midnight in UTC)
  const { from, to, dateStr } = useMemo(() => {
    const y = boardDate.getFullYear();
    const m = boardDate.getMonth();
    const d = boardDate.getDate();
    const fromDate = new Date(y, m, d, 0, 0, 0);
    const toDate = new Date(y, m, d + 1, 0, 0, 0);
    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      dateStr: format(boardDate, 'yyyy-MM-dd'),
    };
  }, [boardDate]);

  const { data: apptData, isLoading: apptLoading } = useAppointments({ from, to });
  const { data: usersData, isLoading: usersLoading } = useUsers();

  const appointments = apptData ?? [];
  const engineers = useMemo(
    () => (usersData ?? []).filter((u) => u.role === 'ENGINEER' && (u as CrmUser & { isActive?: boolean }).isActive !== false),
    [usersData],
  );

  // Group appointments
  const byEngineer = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    const unassigned: Appointment[] = [];
    for (const a of appointments) {
      if (!a.assignedEngineerId || !['COMPLETED', 'CANCELLED'].includes(a.status) === false) {
        if (!a.assignedEngineerId) { unassigned.push(a); continue; }
      }
      if (!a.assignedEngineerId) { unassigned.push(a); continue; }
      const list = map.get(a.assignedEngineerId) ?? [];
      list.push(a);
      map.set(a.assignedEngineerId, list);
    }
    return { byId: map, unassigned };
  }, [appointments]);

  const unassignedCount = byEngineer.unassigned.length;

  // ── Pointer drag handlers ──────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent, appt: Appointment) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragApptRef.current = appt;
    setDraggingId(appt.id);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingId || !boardRef.current) return;
    const boardRect = boardRef.current.getBoundingClientRect();
    const relY = e.clientY - boardRect.top - 40; // 40 = header height approx
    const rowIdx = Math.floor(relY / ROW_H);
    setDropEngineerIdx(Math.max(0, Math.min(engineers.length, rowIdx))); // +1 for unassigned
  }, [draggingId, engineers.length]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingId || dropEngineerIdx === null || !dragApptRef.current) {
      setDraggingId(null);
      setDropEngineerIdx(null);
      return;
    }

    const appt = dragApptRef.current;
    const isUnassignedRow = dropEngineerIdx >= engineers.length;
    const targetEngineer = isUnassignedRow ? null : engineers[dropEngineerIdx];

    if (targetEngineer && targetEngineer.id !== appt.assignedEngineerId) {
      reassign({ id: appt.id, engineerId: targetEngineer.id });
    }

    setDraggingId(null);
    setDropEngineerIdx(null);
    dragApptRef.current = null;
  }, [draggingId, dropEngineerIdx, engineers, reassign]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const isLoading = apptLoading || usersLoading;

  return (
    <div className="space-y-4">
      {/* Board header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <DayNav
          date={boardDate}
          onPrev={() => setBoardDate((d) => subDays(d, 1))}
          onNext={() => setBoardDate((d) => addDays(d, 1))}
          onToday={() => setBoardDate(new Date())}
        />

        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(SURVEY_CONFIG).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`h-2.5 w-2.5 rounded-sm ${(BLOCK_COLORS[key] ?? 'bg-slate-500').split(' ')[0]}`} />
              {cfg.label}
            </div>
          ))}
        </div>
      </div>

      {/* Engineer filter chips (if many engineers) */}
      {engineers.length > 4 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-400 mr-1">Show:</span>
          {engineers.map((eng) => (
            <span key={eng.id} className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
              {eng.name.split(' ')[0]}
            </span>
          ))}
        </div>
      )}

      {/* The Board */}
      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-white py-20">
          <Loader2 size={22} className="animate-spin text-slate-400" />
        </div>
      ) : engineers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-white py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Users size={26} className="text-slate-400" />
          </div>
          <p className="text-base font-semibold text-slate-600">No engineers configured</p>
          <p className="mt-1 text-sm text-slate-400">Add users with the Engineer role to use the dispatch board.</p>
        </div>
      ) : (
        <div
          ref={boardRef}
          className="rounded-xl border border-border bg-white overflow-hidden select-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Sticky header: label column + time axis */}
          <div className="flex border-b border-border bg-slate-50 sticky top-0 z-10">
            {/* Label column header */}
            <div
              className="shrink-0 flex items-center px-3 border-r border-border"
              style={{ width: LABEL_W, height: 36 }}
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Engineers</span>
              {unassignedCount > 0 && (
                <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  <AlertTriangle size={10} />
                  {unassignedCount}
                </span>
              )}
            </div>
            {/* Time axis */}
            <div className="overflow-x-auto flex-1">
              <div className="flex items-center pl-1 pr-4" style={{ width: GRID_W, minWidth: GRID_W }}>
                <TimeAxis />
              </div>
            </div>
          </div>

          {/* Scrollable grid body */}
          <div className="overflow-x-auto relative">
            <div style={{ minWidth: LABEL_W + GRID_W }} className="relative">
              {/* Current time indicator spans all rows */}
              <CurrentTimeIndicator dateStr={dateStr} />

              {/* Engineer rows */}
              {engineers.map((eng, idx) => (
                <EngineerRow
                  key={eng.id}
                  engineer={eng}
                  appointments={byEngineer.byId.get(eng.id) ?? []}
                  isDropTarget={dropEngineerIdx === idx && draggingId !== null}
                  draggingId={draggingId}
                  onBlockClick={onAppointmentClick}
                  onPointerDown={handlePointerDown}
                  rowIndex={idx}
                />
              ))}

              {/* Unassigned row — always last */}
              <EngineerRow
                engineer={null}
                appointments={byEngineer.unassigned}
                isDropTarget={false}
                draggingId={draggingId}
                onBlockClick={onAppointmentClick}
                onPointerDown={handlePointerDown}
                rowIndex={engineers.length}
              />
            </div>
          </div>

          {/* Summary footer */}
          <div className="border-t border-border bg-slate-50 px-4 py-2.5 flex items-center gap-4 text-xs text-slate-500">
            <span>{appointments.length} surveys · {format(boardDate, 'd MMM yyyy')}</span>
            {unassignedCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600 font-medium">
                <AlertTriangle size={11} />
                {unassignedCount} unassigned — drag to an engineer to assign
              </span>
            )}
            {draggingId && (
              <span className="ml-auto text-primary font-medium animate-pulse">
                Dragging… drop on an engineer row to reassign
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
