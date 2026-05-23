'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isToday, isBefore, isSameDay, isSameMonth } from 'date-fns';
import {
  X, ChevronLeft, ChevronRight, Search, Check,
  MapPin, Clock, User, Calendar, Zap, Loader2,
  ChevronDown,
} from 'lucide-react';
import { useAppointmentSlots, useCreateAppointment, type CreateAppointmentInput } from '@/hooks/use-appointments';
import { useLeads, type Lead } from '@/hooks/use-leads';

// ─── Constants ────────────────────────────────────────────────────────────────

const SURVEY_TYPES = [
  { value: 'ROOFTOP_RESIDENTIAL', label: 'Rooftop Residential', icon: '🏠', color: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100' },
  { value: 'COMMERCIAL',          label: 'Commercial',          icon: '🏢', color: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100' },
  { value: 'INDUSTRIAL',          label: 'Industrial',          icon: '⚡', color: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' },
  { value: 'OFFGRID',             label: 'Off-Grid',            icon: '🌿', color: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
] as const;

const DURATIONS = [30, 60, 90, 120] as const;

// Coimbatore default coords for weather when address lat/lng unknown
const DEFAULT_LAT = '11.0168';
const DEFAULT_LNG = '76.9558';

// ─── Weather ──────────────────────────────────────────────────────────────────

interface DayWeather { emoji: string; label: string; ok: boolean }

function useWeatherForDate(dateStr: string | null): DayWeather | null {
  const [weather, setWeather] = useState<DayWeather | null>(null);

  useEffect(() => {
    if (!dateStr) { setWeather(null); return; }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${DEFAULT_LAT}&longitude=${DEFAULT_LNG}&daily=weathercode,precipitation_sum&timezone=Asia%2FKolkata&start_date=${dateStr}&end_date=${dateStr}`;
    fetch(url)
      .then((r) => r.json())
      .then((d: { daily?: { weathercode?: number[]; precipitation_sum?: number[] } }) => {
        const code = d.daily?.weathercode?.[0] ?? 0;
        const rain = d.daily?.precipitation_sum?.[0] ?? 0;
        const emoji = code < 3 ? '☀️' : code < 50 ? '⛅' : '🌧️';
        const label = code < 3 ? 'Clear, good for surveys' : code < 50 ? 'Partly cloudy' : `Rain expected (${rain}mm) — reschedule?`;
        setWeather({ emoji, label, ok: code < 50 });
      })
      .catch(() => setWeather(null));
  }, [dateStr]);

  return weather;
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────

interface MiniCalendarProps {
  value: string | null;
  onChange: (date: string) => void;
}

function MiniCalendar({ value, onChange }: MiniCalendarProps) {
  const [cursor, setCursor] = useState(() => (value ? new Date(value) : new Date()));
  const today = new Date();

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
  });

  return (
    <div className="select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setCursor((c) => subMonths(c, 1))}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-slate-700">{format(cursor, 'MMMM yyyy')}</span>
        <button
          onClick={() => setCursor((c) => addMonths(c, 1))}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="flex items-center justify-center py-1 text-[11px] font-semibold text-slate-400">
            {d}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isSelected = value === dateStr;
          const isPast = isBefore(day, today) && !isToday(day);
          const isCurrentMonth = isSameMonth(day, cursor);
          const isTodayDay = isToday(day);

          return (
            <button
              key={dateStr}
              onClick={() => !isPast && onChange(dateStr)}
              disabled={isPast}
              className={`flex h-8 w-full items-center justify-center rounded-lg text-sm transition-colors ${
                isSelected
                  ? 'bg-primary text-white font-semibold shadow-sm'
                  : isTodayDay && !isSelected
                  ? 'border border-primary text-primary font-semibold'
                  : isPast || !isCurrentMonth
                  ? 'text-slate-300 cursor-default'
                  : 'text-slate-600 hover:bg-primary/10 hover:text-primary'
              }`}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Lead Search ──────────────────────────────────────────────────────────────

interface LeadSearchProps {
  value: Lead | null;
  onChange: (lead: Lead) => void;
}

function LeadSearch({ value, onChange }: LeadSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useLeads(
    query.length >= 2 ? { search: query, limit: '8' } : { limit: '0' },
  );
  const leads = data?.leads ?? [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{value.name}</p>
          <p className="text-xs text-slate-500">{value.phone}{value.city ? ` · ${value.city}` : ''}</p>
        </div>
        <button
          onClick={() => { onChange(null as unknown as Lead); setQuery(''); }}
          className="rounded-lg p-1.5 text-slate-400 hover:text-danger hover:bg-rose-50 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search by name or phone..."
          className="w-full rounded-xl border border-border bg-white py-3 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {isFetching && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
        )}
      </div>

      {open && leads.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-white shadow-lg overflow-hidden">
          {leads.map((lead) => (
            <button
              key={lead.id}
              onClick={() => { onChange(lead); setOpen(false); setQuery(''); }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-border last:border-0"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {lead.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{lead.name}</p>
                <p className="text-xs text-slate-400">{lead.phone}{lead.city ? ` · ${lead.city}` : ''}</p>
              </div>
              <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                lead.stage === 'QUALIFIED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {lead.stage}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && !isFetching && leads.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-white shadow-lg px-4 py-3 text-sm text-slate-400">
          No leads found for "{query}"
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Smart Slot Picker ────────────────────────────────────────────────

interface SlotSelection { engineerId: string; engineerName: string; slot: string }

interface SlotPickerProps {
  date: string | null;
  durationMin: number;
  value: SlotSelection | null;
  onChange: (s: SlotSelection) => void;
  onDateChange: (d: string) => void;
}

function SlotPicker({ date, durationMin, value, onChange, onDateChange }: SlotPickerProps) {
  const { data, isLoading } = useAppointmentSlots(date, durationMin);
  const weather = useWeatherForDate(date);

  return (
    <div className="space-y-4">
      <MiniCalendar value={date} onChange={onDateChange} />

      {date && (
        <>
          {/* Weather badge */}
          {weather && (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium ${
              weather.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              <span className="text-base">{weather.emoji}</span>
              {weather.label}
            </div>
          )}

          {/* Engineer slots */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Available Engineers — {format(new Date(date), 'd MMM')}
            </p>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
              </div>
            ) : !data?.engineers.length ? (
              <div className="rounded-xl border border-border bg-slate-50 px-4 py-6 text-center">
                <User size={24} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm text-slate-400">No engineers available</p>
                <p className="text-xs text-slate-300 mt-0.5">Try a different date</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.engineers.map((eng) => {
                  const isSelected = value?.engineerId === eng.engineerId;
                  const hasSlots = eng.availableSlots.length > 0;

                  return (
                    <div
                      key={eng.engineerId}
                      className={`rounded-xl border p-3 transition-colors ${
                        !hasSlots ? 'opacity-50 border-border bg-slate-50' :
                        isSelected ? 'border-primary bg-primary/5' : 'border-border bg-white hover:border-primary/30'
                      }`}
                    >
                      {/* Engineer header */}
                      <div className="flex items-center gap-2 mb-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {eng.engineerName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                        </span>
                        <span className="text-sm font-medium text-slate-700">{eng.engineerName}</span>
                        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                          eng.bookedCount === 0 ? 'bg-emerald-100 text-emerald-700' :
                          eng.bookedCount <= 2 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {eng.bookedCount === 0 ? 'Free' : `${eng.bookedCount} booked`}
                        </span>
                      </div>

                      {/* Slot pills */}
                      {hasSlots ? (
                        <div className="flex flex-wrap gap-1.5">
                          {eng.availableSlots.slice(0, 10).map((slot) => {
                            const slotSelected = isSelected && value?.slot === slot;
                            return (
                              <button
                                key={slot}
                                onClick={() => onChange({ engineerId: eng.engineerId, engineerName: eng.engineerName, slot })}
                                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                                  slotSelected
                                    ? 'bg-primary text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary'
                                }`}
                              >
                                {format(new Date(slot), 'h:mm a')}
                              </button>
                            );
                          })}
                          {eng.availableSlots.length > 10 && (
                            <span className="flex items-center rounded-lg px-2.5 py-1.5 text-xs text-slate-400">
                              +{eng.availableSlots.length - 10} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">Fully booked for this date</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i < current ? 'bg-primary' : i === current ? 'bg-primary/40' : 'bg-slate-200'
          }`}
        />
      ))}
    </div>
  );
}

// ─── Main drawer ──────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<Step, string> = {
  1: 'Lead & Survey Type',
  2: 'Date & Engineer',
  3: 'Site Details',
  4: 'Review & Book',
};

interface BookSurveyDrawerProps {
  open: boolean;
  onClose: () => void;
  prefillLeadId?: string;
}

export function BookSurveyDrawer({ open, onClose, prefillLeadId }: BookSurveyDrawerProps) {
  const [step, setStep] = useState<Step>(1);
  const [lead, setLead] = useState<Lead | null>(null);
  const [surveyType, setSurveyType] = useState<string>('');
  const [date, setDate] = useState<string | null>(null);
  const [slotSelection, setSlotSelection] = useState<{ engineerId: string; engineerName: string; slot: string } | null>(null);
  const [durationMin, setDurationMin] = useState<number>(60);
  const [siteAddress, setSiteAddress] = useState('');
  const [notifyLead, setNotifyLead] = useState(true);
  const [notifyEngineer, setNotifyEngineer] = useState(true);

  const { mutate: createAppointment, isPending } = useCreateAppointment();

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(1);
        setLead(null);
        setSurveyType('');
        setDate(null);
        setSlotSelection(null);
        setDurationMin(60);
        setSiteAddress('');
      }, 300);
    }
  }, [open]);

  const canAdvance1 = !!lead && !!surveyType;
  const canAdvance2 = !!date && !!slotSelection;
  const canAdvance3 = siteAddress.trim().length >= 5;

  function handleBook() {
    if (!lead || !surveyType || !slotSelection || !siteAddress) return;
    const payload: CreateAppointmentInput = {
      leadId: lead.id,
      scheduledAt: slotSelection.slot,
      surveyType,
      siteAddress: siteAddress.trim(),
      durationMin,
      ...(slotSelection.engineerId ? { assignedEngineerId: slotSelection.engineerId } : {}),
    };
    createAppointment(payload, { onSuccess: onClose });
  }

  const surveyCfg = SURVEY_TYPES.find((s) => s.value === surveyType);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">New Survey · Step {step}/4</p>
              <h2 className="text-base font-bold text-slate-800">{STEP_TITLES[step]}</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <StepBar current={step - 1} total={4} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* ── Step 1: Lead + Survey Type ── */}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Lead</label>
                <LeadSearch value={lead} onChange={(l) => setLead(l)} />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Survey Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {SURVEY_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setSurveyType(t.value)}
                      className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
                        surveyType === t.value
                          ? `${t.color} ring-2 ring-offset-1 ring-current shadow-sm`
                          : 'border-border bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-xl">{t.icon}</span>
                      <span className="text-left text-xs leading-tight">{t.label}</span>
                      {surveyType === t.value && <Check size={14} className="ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Step 2: Date + Slot ── */}
          {step === 2 && (
            <SlotPicker
              date={date}
              durationMin={durationMin}
              value={slotSelection}
              onChange={(s) => setSlotSelection(s)}
              onDateChange={(d) => { setDate(d); setSlotSelection(null); }}
            />
          )}

          {/* ── Step 3: Site address + duration ── */}
          {step === 3 && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Site Address
                </label>
                <div className="relative">
                  <MapPin size={15} className="absolute left-3 top-3.5 text-slate-400" />
                  <textarea
                    value={siteAddress}
                    onChange={(e) => setSiteAddress(e.target.value)}
                    rows={3}
                    placeholder="Full site address including landmark, city, pincode..."
                    className="w-full rounded-xl border border-border bg-white py-3 pl-9 pr-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <p className="text-xs text-slate-400">Minimum 5 characters required</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Survey Duration
                </label>
                <div className="flex gap-2">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDurationMin(d)}
                      className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-colors ${
                        durationMin === d
                          ? 'border-primary bg-primary text-white shadow-sm'
                          : 'border-border bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {d}m
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Step 4: Review + Notify ── */}
          {step === 4 && lead && slotSelection && (
            <div className="space-y-4">
              {/* Summary card */}
              <div className="rounded-xl border border-border bg-slate-50 divide-y divide-border overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {lead.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{lead.name}</p>
                    <p className="text-xs text-slate-400">{lead.phone}</p>
                  </div>
                  {surveyCfg && (
                    <span className="ml-auto text-lg">{surveyCfg.icon}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 px-4 py-3 text-sm">
                  <Calendar size={14} className="text-slate-400 shrink-0" />
                  <span className="text-slate-700 font-medium">
                    {date ? format(new Date(slotSelection.slot), 'EEEE, d MMMM yyyy') : '—'}
                  </span>
                </div>

                <div className="flex items-center gap-2 px-4 py-3 text-sm">
                  <Clock size={14} className="text-slate-400 shrink-0" />
                  <span className="text-slate-700">
                    {format(new Date(slotSelection.slot), 'h:mm a')}
                    <span className="ml-1.5 text-slate-400">· {durationMin} min</span>
                  </span>
                </div>

                <div className="flex items-start gap-2 px-4 py-3 text-sm">
                  <MapPin size={14} className="mt-0.5 text-slate-400 shrink-0" />
                  <span className="text-slate-700">{siteAddress}</span>
                </div>

                <div className="flex items-center gap-2 px-4 py-3 text-sm">
                  <User size={14} className="text-slate-400 shrink-0" />
                  <span className="text-slate-700">{slotSelection.engineerName}</span>
                  <span className="ml-auto text-xs text-emerald-600 font-medium">Assigned</span>
                </div>
              </div>

              {/* Notifications */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">WhatsApp Notifications</p>
                <div className="space-y-2 rounded-xl border border-border bg-white p-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyLead}
                      onChange={(e) => setNotifyLead(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-700">Confirmation to {lead.name}</p>
                      <p className="text-xs text-slate-400">+91 {lead.phone} · Confirm/Reschedule options</p>
                    </div>
                  </label>
                  <div className="h-px bg-border" />
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyEngineer}
                      onChange={(e) => setNotifyEngineer(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-700">Assignment to {slotSelection.engineerName}</p>
                      <p className="text-xs text-slate-400">Address + pre-visit checklist link</p>
                    </div>
                  </label>
                </div>
                <p className="flex items-center gap-1 text-xs text-slate-400">
                  <Zap size={11} className="text-amber-500" />
                  WhatsApp integration sends these automatically after booking.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="shrink-0 border-t border-border px-5 py-4 flex gap-3">
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft size={15} />
              Back
            </button>
          ) : (
            <button
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          )}

          {step < 4 ? (
            <button
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={
                (step === 1 && !canAdvance1) ||
                (step === 2 && !canAdvance2) ||
                (step === 3 && !canAdvance3)
              }
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Continue
              <ChevronRight size={15} />
            </button>
          ) : (
            <button
              onClick={handleBook}
              disabled={isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-sm"
            >
              {isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Book Survey
            </button>
          )}
        </div>
      </div>
    </>
  );
}
