'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  X, MapPin, Clock, User, Phone, Calendar, CheckCircle2,
  UserX, XCircle, RefreshCw, UserCog, ExternalLink,
  ChevronDown, Zap, AlertTriangle, ClipboardList, Loader2,
} from 'lucide-react';
import {
  useConfirmAppointment,
  useNoShowAppointment,
  useCompleteAppointment,
  useCancelAppointment,
  useReassignAppointment,
  type Appointment,
  type AppointmentStatus,
} from '@/hooks/use-appointments';
import { useTeams, type Team } from '@/hooks/use-teams';

// ─── Shared config ────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<AppointmentStatus, { label: string; dotClass: string; badgeClass: string; borderClass: string }> = {
  SCHEDULED:  { label: 'Scheduled',  dotClass: 'bg-indigo-400',  badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',   borderClass: 'border-l-indigo-400' },
  CONFIRMED:  { label: 'Confirmed',  dotClass: 'bg-blue-500',    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',           borderClass: 'border-l-blue-500' },
  COMPLETED:  { label: 'Completed',  dotClass: 'bg-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200', borderClass: 'border-l-emerald-500' },
  NO_SHOW:    { label: 'No-Show',    dotClass: 'bg-rose-500',    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',           borderClass: 'border-l-rose-500' },
  RESCHEDULED:{ label: 'Rescheduled',dotClass: 'bg-amber-400',   badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',        borderClass: 'border-l-amber-400' },
  CANCELLED:  { label: 'Cancelled',  dotClass: 'bg-slate-400',   badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',       borderClass: 'border-l-slate-300' },
};

export const SURVEY_CONFIG: Record<string, { label: string; icon: string; colorClass: string }> = {
  ROOFTOP_RESIDENTIAL: { label: 'Rooftop Residential', icon: '🏠', colorClass: 'text-sky-700 bg-sky-50' },
  COMMERCIAL:          { label: 'Commercial',          icon: '🏢', colorClass: 'text-violet-700 bg-violet-50' },
  INDUSTRIAL:          { label: 'Industrial',          icon: '⚡', colorClass: 'text-amber-700 bg-amber-50' },
  OFFGRID:             { label: 'Off-Grid',            icon: '🌿', colorClass: 'text-emerald-700 bg-emerald-50' },
};

const CHECKLIST: Record<string, string[]> = {
  ROOFTOP_RESIDENTIAL: [
    'Confirm roof type (RCC / metal / tiled)',
    'Measure available shadow-free area',
    'Check electricity bill (3-month avg)',
    'Identify inverter room / DB location',
    'Check roof load bearing capacity',
    'Note shading obstructions (tanks, AC units)',
  ],
  COMMERCIAL: [
    'Check load profile & sanctioned load',
    'Note DG set presence & rating',
    'Identify transformer rating & location',
    'Measure available roof area',
    'Check structural report availability',
    'Verify net-metering feasibility with DISCOM',
  ],
  INDUSTRIAL: [
    'Confirm HT / LT connection type',
    'Note total contracted demand (kVA)',
    'Check available open land or roof area',
    'Verify roof material & load capacity',
    'Identify power factor correction needs',
    'Check DISCOM feeder stability',
  ],
  OFFGRID: [
    'Assess load requirement (appliances list)',
    'Check battery backup hours needed',
    'Note grid availability (hours/day)',
    'Identify mounting structure space',
    'Check transport access for equipment',
    'Note any critical load requirements',
  ],
};

// ─── Complete Survey Form ─────────────────────────────────────────────────────

function CompleteSurveyForm({
  appointmentId,
  onDone,
  onCancel,
}: {
  appointmentId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [kw, setKw] = useState('');
  const [roofCond, setRoofCond] = useState('Good');
  const [notes, setNotes] = useState('');
  const [readyToQuote, setReadyToQuote] = useState(true);
  const { mutate, isPending } = useCompleteAppointment();

  function submit() {
    const payload: Parameters<typeof mutate>[0] = { id: appointmentId, roofCondition: roofCond, readyToQuote };
    if (kw) payload.estimatedKw = parseFloat(kw);
    if (notes) payload.postNotes = notes;
    mutate(payload, { onSuccess: onDone });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-700">Survey Report</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600">Estimated Size (kW)</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="e.g. 5.0"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Roof Condition</label>
          <select
            value={roofCond}
            onChange={(e) => setRoofCond(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {['Excellent', 'Good', 'Fair', 'Poor', 'Needs Repair'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600">Site Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Any observations, issues, or customer feedback..."
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={readyToQuote}
          onChange={(e) => setReadyToQuote(e.target.checked)}
          className="h-4 w-4 rounded border-border text-primary accent-primary"
        />
        <span className="text-sm text-slate-700">Auto-create quotation draft</span>
        <Zap size={13} className="text-amber-500" />
      </label>

      <div className="flex gap-2 pt-1">
        <button
          onClick={submit}
          disabled={isPending}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
        >
          {isPending && <Loader2 size={14} className="animate-spin" />}
          Submit Survey
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Cancel Confirm ───────────────────────────────────────────────────────────

function CancelConfirm({
  appointmentId,
  onDone,
  onCancel,
}: {
  appointmentId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const { mutate, isPending } = useCancelAppointment();

  return (
    <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
      <p className="text-sm font-semibold text-rose-700">Cancel Appointment</p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for cancellation..."
        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
      />
      <div className="flex gap-2">
        <button
          onClick={() => mutate({ id: appointmentId, reason }, { onSuccess: onDone })}
          disabled={isPending}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60 transition-colors"
        >
          {isPending && <Loader2 size={14} className="animate-spin" />}
          Confirm Cancel
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
}

// ─── Weather Badge ────────────────────────────────────────────────────────────

interface WeatherData { label: string; emoji: string; ok: boolean }

function useWeather(lat: string | null, lng: string | null, dateStr: string): WeatherData | null {
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    if (!lat || !lng) return;
    const date = dateStr.slice(0, 10);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,precipitation_sum&timezone=Asia%2FKolkata&start_date=${date}&end_date=${date}`;
    fetch(url)
      .then((r) => r.json())
      .then((d: { daily?: { weathercode?: number[]; precipitation_sum?: number[] } }) => {
        const code = d.daily?.weathercode?.[0] ?? 0;
        const rain = d.daily?.precipitation_sum?.[0] ?? 0;
        const emoji = code < 3 ? '☀️' : code < 50 ? '⛅' : '🌧️';
        const label = code < 3 ? 'Clear' : code < 50 ? 'Cloudy' : `Rain (${rain}mm)`;
        setWeather({ emoji, label, ok: code < 50 });
      })
      .catch(() => null);
  }, [lat, lng, dateStr]);

  return weather;
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

type DrawerPanel = 'detail' | 'complete' | 'cancel';

interface AppointmentDrawerProps {
  appointment: Appointment | null;
  open: boolean;
  onClose: () => void;
}

export function AppointmentDrawer({ appointment, open, onClose }: AppointmentDrawerProps) {
  const [panel, setPanel] = useState<DrawerPanel>('detail');
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  const { mutate: confirm, isPending: confirming } = useConfirmAppointment();
  const { mutate: noShow, isPending: markingNoShow } = useNoShowAppointment();
  const { data: teamsData } = useTeams();

  const weather = useWeather(
    appointment?.siteLat ?? null,
    appointment?.siteLng ?? null,
    appointment?.scheduledAt ?? '',
  );

  useEffect(() => {
    if (!open) {
      setTimeout(() => setPanel('detail'), 300);
      setCheckedItems(new Set());
    }
  }, [open]);

  if (!appointment) return null;

  const statusCfg = STATUS_CONFIG[appointment.status] ?? STATUS_CONFIG['SCHEDULED']!;
  const surveyCfg = SURVEY_CONFIG[appointment.surveyType] ?? { label: appointment.surveyType, icon: '📋', colorClass: 'text-slate-600 bg-slate-50' };
  const checklist = CHECKLIST[appointment.surveyType] ?? [];
  const engineers = ((teamsData as Team[] | undefined) ?? [])
    .flatMap((t) => t.members ?? [])
    .filter((m) => m.role === 'ENGINEER');

  const canAct = !['COMPLETED', 'CANCELLED'].includes(appointment.status);
  const isScheduled = appointment.status === 'SCHEDULED';
  const isConfirmed = appointment.status === 'CONFIRMED';
  const isTerminal = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appointment.status);

  function handleActionDone() {
    setPanel('detail');
    onClose();
  }

  const mapsUrl = appointment.siteLat && appointment.siteLng
    ? `https://maps.google.com/?q=${appointment.siteLat},${appointment.siteLng}`
    : `https://maps.google.com/?q=${encodeURIComponent(appointment.siteAddress)}`;

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
        <div className={`flex items-start justify-between border-b border-border px-5 py-4 border-l-4 ${statusCfg.borderClass}`}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${surveyCfg.colorClass}`}>
                {surveyCfg.icon} {surveyCfg.label}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusCfg.badgeClass}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dotClass} ${appointment.status === 'CONFIRMED' ? 'animate-pulse' : ''}`} />
                {statusCfg.label}
              </span>
            </div>
            <p className="mt-1.5 text-base font-bold text-slate-800">
              {appointment.lead?.name ?? 'Unknown Lead'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 mt-0.5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Lead contact */}
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {(appointment.lead?.name ?? 'U').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">{appointment.lead?.name ?? '—'}</p>
              <a
                href={`tel:${appointment.lead?.phone}`}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Phone size={11} />
                {appointment.lead?.phone ?? '—'}
              </a>
            </div>
            <a
              href={`/leads/${appointment.leadId}`}
              className="shrink-0 rounded-lg border border-primary/20 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors flex items-center gap-1"
            >
              Lead <ExternalLink size={11} />
            </a>
          </div>

          {/* Date, time, address */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-3 text-sm">
              <Calendar size={15} className="shrink-0 text-slate-400" />
              <span className="font-medium text-slate-700">
                {format(new Date(appointment.scheduledAt), 'EEEE, d MMMM yyyy')}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Clock size={15} className="shrink-0 text-slate-400" />
              <span className="text-slate-600">
                {format(new Date(appointment.scheduledAt), 'h:mm a')}
                <span className="ml-1.5 text-slate-400">· {appointment.durationMin} min</span>
              </span>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <MapPin size={15} className="shrink-0 mt-0.5 text-slate-400" />
              <div className="flex-1 min-w-0">
                <span className="text-slate-600">{appointment.siteAddress}</span>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  Maps <ExternalLink size={10} />
                </a>
              </div>
            </div>

            {/* Weather */}
            {weather && (
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${weather.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                <span>{weather.emoji}</span>
                {weather.label}
                {!weather.ok && <AlertTriangle size={12} className="ml-auto" />}
              </div>
            )}
          </div>

          {/* Engineer */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assigned Engineer</p>
            {appointment.assignedEngineerId ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {(engineers.find((e) => e.id === appointment.assignedEngineerId)?.name ?? 'E')
                    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                </span>
                <span className="flex-1 text-sm font-medium text-slate-700">
                  {engineers.find((e) => e.id === appointment.assignedEngineerId)?.name ?? 'Engineer'}
                </span>
                <UserCog size={14} className="text-slate-400" />
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <AlertTriangle size={15} className="text-amber-500 shrink-0" />
                <span className="text-sm font-medium text-amber-700">Not assigned yet</span>
              </div>
            )}
          </div>

          {/* Pre-visit checklist */}
          {checklist.length > 0 && panel === 'detail' && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <ClipboardList size={13} />
                Pre-Visit Checklist
              </p>
              <div className="rounded-xl border border-border overflow-hidden">
                {checklist.map((item, i) => (
                  <label
                    key={i}
                    className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-slate-50 ${i !== 0 ? 'border-t border-border' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checkedItems.has(i)}
                      onChange={(e) =>
                        setCheckedItems((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(i); else next.delete(i);
                          return next;
                        })
                      }
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <span className={checkedItems.has(i) ? 'line-through text-slate-400' : 'text-slate-700'}>
                      {item}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-400 text-right">
                {checkedItems.size}/{checklist.length} checked
              </p>
            </div>
          )}

          {/* Completed survey results */}
          {appointment.status === 'COMPLETED' && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Survey Results</p>
              {appointment.estimatedKw && (
                <p className="text-sm text-slate-700">
                  <span className="font-medium">Estimated size:</span> {appointment.estimatedKw} kW
                </p>
              )}
              {appointment.roofCondition && (
                <p className="text-sm text-slate-700">
                  <span className="font-medium">Roof condition:</span> {appointment.roofCondition}
                </p>
              )}
              {appointment.postNotes && (
                <p className="text-sm text-slate-600 italic">&quot;{appointment.postNotes}&quot;</p>
              )}
              {appointment.completedAt && (
                <p className="text-xs text-slate-400">
                  Completed {format(new Date(appointment.completedAt), 'd MMM, h:mm a')}
                </p>
              )}
            </div>
          )}

          {/* Cancel reason */}
          {appointment.status === 'CANCELLED' && appointment.cancelReason && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Cancellation Reason</p>
              <p className="text-sm text-slate-600">{appointment.cancelReason}</p>
            </div>
          )}

          {/* No-show info */}
          {appointment.status === 'NO_SHOW' && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 mb-1">No-Show Recorded</p>
              {appointment.noShowAt && (
                <p className="text-sm text-rose-700">
                  Marked at {format(new Date(appointment.noShowAt), 'd MMM, h:mm a')}
                </p>
              )}
              <p className="text-xs text-rose-500 mt-1">Reshma re-engagement call has been queued automatically.</p>
            </div>
          )}

          {/* Complete survey form */}
          {panel === 'complete' && (
            <CompleteSurveyForm
              appointmentId={appointment.id}
              onDone={handleActionDone}
              onCancel={() => setPanel('detail')}
            />
          )}

          {/* Cancel confirm */}
          {panel === 'cancel' && (
            <CancelConfirm
              appointmentId={appointment.id}
              onDone={handleActionDone}
              onCancel={() => setPanel('detail')}
            />
          )}
        </div>

        {/* Action footer */}
        {canAct && panel === 'detail' && (
          <div className="shrink-0 border-t border-border px-5 py-4">
            {isScheduled && (
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => confirm(appointment.id, { onSuccess: onClose })}
                  disabled={confirming}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  {confirming ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Confirm
                </button>
                <button
                  onClick={() => setPanel('complete')}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                >
                  <ClipboardList size={14} />
                  Complete
                </button>
                <button
                  onClick={() => setPanel('cancel')}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <XCircle size={14} />
                  Cancel
                </button>
              </div>
            )}

            {isConfirmed && (
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setPanel('complete')}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors col-span-1"
                >
                  <ClipboardList size={14} />
                  Complete
                </button>
                <button
                  onClick={() => noShow(appointment.id, { onSuccess: onClose })}
                  disabled={markingNoShow}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60 transition-colors"
                >
                  {markingNoShow ? <Loader2 size={14} className="animate-spin" /> : <UserX size={14} />}
                  No-Show
                </button>
                <button
                  onClick={() => setPanel('cancel')}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <XCircle size={14} />
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
