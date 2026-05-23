'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Check, ChevronDown, Loader2, Pencil, X, Activity } from 'lucide-react';
import { toast } from 'sonner';
import {
  useUpdateNetMetering,
  NM_STATUS_LABEL,
  type NetMeteringStatus,
  type NetMeteringUpdateData,
} from '@/hooks/use-projects';

const STATUS_ORDER: NetMeteringStatus[] = [
  'NOT_APPLIED',
  'SLD_SUBMITTED',
  'LOAD_SANCTION_APPLIED',
  'INSPECTION_DONE',
  'METER_CHANGED',
  'GRID_SYNCED',
  'ACTIVE',
];

const PIPELINE: { status: NetMeteringStatus; short: string; color: string }[] = [
  { status: 'SLD_SUBMITTED',         short: 'SLD',          color: 'bg-blue-400' },
  { status: 'LOAD_SANCTION_APPLIED', short: 'Load',         color: 'bg-indigo-400' },
  { status: 'INSPECTION_DONE',       short: 'Inspect',      color: 'bg-violet-400' },
  { status: 'METER_CHANGED',         short: 'Meter',        color: 'bg-amber-400' },
  { status: 'GRID_SYNCED',           short: 'Grid Sync',    color: 'bg-cyan-500' },
  { status: 'ACTIVE',                short: 'Active',       color: 'bg-success' },
];

function toDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}
function fromDate(val: string): string | null {
  return val ? new Date(val + 'T12:00:00').toISOString() : null;
}
function fmt(iso: string | null): string {
  return iso ? format(new Date(iso), 'd MMM yyyy') : '—';
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ProjectNetMeteringTracker({
  projectId,
  netMeteringStatus,
  netMeteringAppRef,
  netMeteringMeterNumber,
  netMeteringInspectorName,
  netMeteringSldAt,
  netMeteringLoadAt,
  netMeteringInspectionAt,
  netMeteringMeterAt,
  netMeteringGridSyncAt,
  netMeteringFirstExportAt,
}: {
  projectId: string;
  netMeteringStatus: NetMeteringStatus | null;
  netMeteringAppRef: string | null;
  netMeteringMeterNumber: string | null;
  netMeteringInspectorName: string | null;
  netMeteringSldAt: string | null;
  netMeteringLoadAt: string | null;
  netMeteringInspectionAt: string | null;
  netMeteringMeterAt: string | null;
  netMeteringGridSyncAt: string | null;
  netMeteringFirstExportAt: string | null;
}) {
  const update = useUpdateNetMetering();
  const [editing, setEditing] = useState(false);

  const [status, setStatus]             = useState<NetMeteringStatus>(netMeteringStatus ?? 'NOT_APPLIED');
  const [appRef, setAppRef]             = useState(netMeteringAppRef ?? '');
  const [meterNo, setMeterNo]           = useState(netMeteringMeterNumber ?? '');
  const [inspector, setInspector]       = useState(netMeteringInspectorName ?? '');
  const [sldAt, setSldAt]               = useState(toDate(netMeteringSldAt));
  const [loadAt, setLoadAt]             = useState(toDate(netMeteringLoadAt));
  const [inspectionAt, setInspectionAt] = useState(toDate(netMeteringInspectionAt));
  const [meterAt, setMeterAt]           = useState(toDate(netMeteringMeterAt));
  const [gridSyncAt, setGridSyncAt]     = useState(toDate(netMeteringGridSyncAt));
  const [firstExportAt, setFirstExportAt] = useState(toDate(netMeteringFirstExportAt));

  const currentIdx = STATUS_ORDER.indexOf(netMeteringStatus ?? 'NOT_APPLIED');
  const isActive   = netMeteringStatus === 'ACTIVE';

  function openEdit() {
    setStatus(netMeteringStatus ?? 'NOT_APPLIED');
    setAppRef(netMeteringAppRef ?? '');
    setMeterNo(netMeteringMeterNumber ?? '');
    setInspector(netMeteringInspectorName ?? '');
    setSldAt(toDate(netMeteringSldAt));
    setLoadAt(toDate(netMeteringLoadAt));
    setInspectionAt(toDate(netMeteringInspectionAt));
    setMeterAt(toDate(netMeteringMeterAt));
    setGridSyncAt(toDate(netMeteringGridSyncAt));
    setFirstExportAt(toDate(netMeteringFirstExportAt));
    setEditing(true);
  }

  async function handleSave() {
    const data: NetMeteringUpdateData = {
      netMeteringStatus: status,
      netMeteringAppRef: appRef.trim() || null,
      netMeteringMeterNumber: meterNo.trim() || null,
      netMeteringInspectorName: inspector.trim() || null,
      netMeteringSldAt: fromDate(sldAt),
      netMeteringLoadAt: fromDate(loadAt),
      netMeteringInspectionAt: fromDate(inspectionAt),
      netMeteringMeterAt: fromDate(meterAt),
      netMeteringGridSyncAt: fromDate(gridSyncAt),
      netMeteringFirstExportAt: fromDate(firstExportAt),
    };
    try {
      await update.mutateAsync({ id: projectId, data });
      toast.success('Net metering updated');
      setEditing(false);
    } catch {
      toast.error('Failed to update net metering');
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Activity size={15} className="text-cyan-500" />
          <h3 className="text-sm font-semibold text-slate-700">Net Metering</h3>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            isActive
              ? 'bg-success/10 text-success'
              : currentIdx > 0
              ? 'bg-cyan-100 text-cyan-700'
              : 'bg-slate-100 text-slate-500'
          }`}>
            {NM_STATUS_LABEL[netMeteringStatus ?? 'NOT_APPLIED']}
          </span>
        </div>
        <button
          onClick={() => editing ? setEditing(false) : openEdit()}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
            editing ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'border border-border text-slate-600 hover:bg-slate-50'
          }`}
        >
          {editing ? <X size={13} /> : <Pencil size={13} />}
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Stepper — 6 steps, horizontal */}
        <div className="flex items-start">
          {PIPELINE.map((step, idx) => {
            const stepIdx = STATUS_ORDER.indexOf(step.status);
            const done    = stepIdx < currentIdx;
            const current = step.status === (netMeteringStatus ?? 'NOT_APPLIED');
            const nextIdx = idx < PIPELINE.length - 1 ? STATUS_ORDER.indexOf(PIPELINE[idx + 1]!.status) : -1;
            return (
              <div key={step.status} className="flex items-start flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    done
                      ? 'bg-success text-white'
                      : current
                      ? `${step.color} text-white ring-4 ring-current/10`
                      : 'bg-slate-100 text-slate-300'
                  }`}>
                    {done ? <Check size={11} /> : idx + 1}
                  </div>
                  <span
                    className={`text-center text-[9px] leading-tight font-medium ${
                      current ? 'text-cyan-600' : done ? 'text-slate-500' : 'text-slate-300'
                    }`}
                    style={{ maxWidth: '3rem' }}
                  >
                    {step.short}
                  </span>
                </div>
                {idx < PIPELINE.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-0.5 mt-3 ${
                      nextIdx <= currentIdx && currentIdx > 0 ? 'bg-success' : 'bg-slate-100'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Info summary (view mode) */}
        {!editing && currentIdx > 0 && (
          <div className="rounded-xl bg-slate-50 px-4 py-3 space-y-1.5">
            {netMeteringAppRef && <InfoRow label="Application ref" value={netMeteringAppRef} mono />}
            {netMeteringMeterNumber && <InfoRow label="Meter number" value={netMeteringMeterNumber} mono />}
            {netMeteringInspectorName && <InfoRow label="Inspector" value={netMeteringInspectorName} />}
            {netMeteringSldAt && <InfoRow label="SLD submitted" value={fmt(netMeteringSldAt)} />}
            {netMeteringLoadAt && <InfoRow label="Load sanction" value={fmt(netMeteringLoadAt)} />}
            {netMeteringInspectionAt && <InfoRow label="Inspection" value={fmt(netMeteringInspectionAt)} />}
            {netMeteringMeterAt && <InfoRow label="Meter changed" value={fmt(netMeteringMeterAt)} />}
            {netMeteringGridSyncAt && <InfoRow label="Grid synced" value={fmt(netMeteringGridSyncAt)} />}
            {netMeteringFirstExportAt && (
              <InfoRow
                label="First export"
                value={fmt(netMeteringFirstExportAt)}
                valueClass="text-success font-bold"
              />
            )}
          </div>
        )}

        {/* Not started placeholder */}
        {!editing && currentIdx === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-6 text-center">
            <Activity size={20} className="text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">Net metering not yet applied</p>
            <p className="text-xs text-slate-300 mt-0.5">Click Edit to track DISCOM / TANGEDCO application</p>
          </div>
        )}

        {/* Edit form */}
        {editing && (
          <div className="space-y-3">
            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as NetMeteringStatus)}
                  className="w-full appearance-none rounded-lg border border-border bg-white py-2 pl-3 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{NM_STATUS_LABEL[s]}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-2 top-2.5 text-slate-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Application Reference</label>
                <input
                  value={appRef}
                  onChange={(e) => setAppRef(e.target.value)}
                  placeholder="DISCOM application ID"
                  className="w-full rounded-lg border border-border bg-white py-2 px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Meter Number</label>
                <input
                  value={meterNo}
                  onChange={(e) => setMeterNo(e.target.value)}
                  placeholder="Bi-directional meter ID"
                  className="w-full rounded-lg border border-border bg-white py-2 px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Inspector Name</label>
                <input
                  value={inspector}
                  onChange={(e) => setInspector(e.target.value)}
                  placeholder="DISCOM / TANGEDCO inspector"
                  className="w-full rounded-lg border border-border bg-white py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            {/* Milestone dates */}
            <div className="rounded-xl border border-border p-3 space-y-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Milestone Dates</span>
              <div className="grid grid-cols-2 gap-2.5">
                <DateField label="SLD submitted" value={sldAt} onChange={setSldAt} />
                <DateField label="Load sanction applied" value={loadAt} onChange={setLoadAt} />
                <DateField label="Inspection done" value={inspectionAt} onChange={setInspectionAt} />
                <DateField label="Meter changed" value={meterAt} onChange={setMeterAt} />
                <DateField label="Grid synced" value={gridSyncAt} onChange={setGridSyncAt} />
                <DateField label="First export" value={firstExportAt} onChange={setFirstExportAt} />
              </div>
            </div>

            <button
              onClick={() => void handleSave()}
              disabled={update.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {update.isPending && <Loader2 size={14} className="animate-spin" />}
              {update.isPending ? 'Saving…' : 'Save Net Metering Details'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function InfoRow({
  label, value, mono = false, valueClass = 'text-slate-700 font-medium',
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs gap-3">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className={`text-right ${valueClass} ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function DateField({
  label, value, onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-white py-1.5 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}
