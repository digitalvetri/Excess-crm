'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Check, ChevronDown, Zap, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useUpdateSubsidy,
  SUBSIDY_SCHEME_LABEL,
  SUBSIDY_STATUS_LABEL,
  type SubsidyScheme,
  type SubsidyStatus,
  type SubsidyUpdateData,
} from '@/hooks/use-projects';

const STATUS_ORDER: SubsidyStatus[] = [
  'NOT_APPLIED',
  'APPLIED',
  'DISCOM_INSPECTION_SCHEDULED',
  'DISCOM_APPROVED',
  'PORTAL_UPLOAD_DONE',
  'CREDITED',
];

const PIPELINE: { status: SubsidyStatus; short: string }[] = [
  { status: 'APPLIED',                     short: 'Applied' },
  { status: 'DISCOM_INSPECTION_SCHEDULED', short: 'Inspection' },
  { status: 'DISCOM_APPROVED',             short: 'Approved' },
  { status: 'PORTAL_UPLOAD_DONE',          short: 'Uploaded' },
  { status: 'CREDITED',                    short: 'Credited' },
];

const SCHEMES: SubsidyScheme[] = ['NONE', 'PM_SURYA_GHAR', 'STATE_TEDA', 'STATE_OTHER'];

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
export function ProjectSubsidyTracker({
  projectId,
  subsidyScheme,
  subsidyStatus,
  subsidyAppRef,
  subsidyExpectedAmtInr,
  subsidyAppliedAt,
  subsidyInspectionAt,
  subsidyApprovedAt,
  subsidyPortalUploadAt,
  subsidyCreditedAt,
  subsidyCreditedAmtInr,
}: {
  projectId: string;
  subsidyScheme: SubsidyScheme;
  subsidyStatus: SubsidyStatus | null;
  subsidyAppRef: string | null;
  subsidyExpectedAmtInr: string | null;
  subsidyAppliedAt: string | null;
  subsidyInspectionAt: string | null;
  subsidyApprovedAt: string | null;
  subsidyPortalUploadAt: string | null;
  subsidyCreditedAt: string | null;
  subsidyCreditedAmtInr: string | null;
}) {
  const update = useUpdateSubsidy();
  const [editing, setEditing] = useState(false);

  const [scheme, setScheme]           = useState<SubsidyScheme>(subsidyScheme);
  const [status, setStatus]           = useState<SubsidyStatus>(subsidyStatus ?? 'NOT_APPLIED');
  const [appRef, setAppRef]           = useState(subsidyAppRef ?? '');
  const [expectedAmt, setExpectedAmt] = useState(subsidyExpectedAmtInr ?? '');
  const [appliedAt, setAppliedAt]     = useState(toDate(subsidyAppliedAt));
  const [inspectionAt, setInspectionAt] = useState(toDate(subsidyInspectionAt));
  const [approvedAt, setApprovedAt]   = useState(toDate(subsidyApprovedAt));
  const [portalAt, setPortalAt]       = useState(toDate(subsidyPortalUploadAt));
  const [creditedAt, setCreditedAt]   = useState(toDate(subsidyCreditedAt));
  const [creditedAmt, setCreditedAmt] = useState(subsidyCreditedAmtInr ?? '');

  const currentIdx = STATUS_ORDER.indexOf(subsidyStatus ?? 'NOT_APPLIED');
  const hasSubsidy = subsidyScheme !== 'NONE';

  function openEdit() {
    setScheme(subsidyScheme);
    setStatus(subsidyStatus ?? 'NOT_APPLIED');
    setAppRef(subsidyAppRef ?? '');
    setExpectedAmt(subsidyExpectedAmtInr ?? '');
    setAppliedAt(toDate(subsidyAppliedAt));
    setInspectionAt(toDate(subsidyInspectionAt));
    setApprovedAt(toDate(subsidyApprovedAt));
    setPortalAt(toDate(subsidyPortalUploadAt));
    setCreditedAt(toDate(subsidyCreditedAt));
    setCreditedAmt(subsidyCreditedAmtInr ?? '');
    setEditing(true);
  }

  async function handleSave() {
    const data: SubsidyUpdateData = {
      subsidyScheme: scheme,
      subsidyStatus: status,
      subsidyAppRef: appRef.trim() || null,
      subsidyAppliedAt: fromDate(appliedAt),
      subsidyInspectionAt: fromDate(inspectionAt),
      subsidyApprovedAt: fromDate(approvedAt),
      subsidyPortalUploadAt: fromDate(portalAt),
      subsidyCreditedAt: fromDate(creditedAt),
    };
    const exp = parseFloat(expectedAmt);
    data.subsidyExpectedAmtInr = (!isNaN(exp) && exp > 0) ? exp : null;
    const cred = parseFloat(creditedAmt);
    data.subsidyCreditedAmtInr = (!isNaN(cred) && cred > 0) ? cred : null;

    try {
      await update.mutateAsync({ id: projectId, data });
      toast.success('Subsidy details updated');
      setEditing(false);
    } catch {
      toast.error('Failed to update subsidy details');
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Zap size={15} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-700">Subsidy Pipeline</h3>
          {hasSubsidy && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              {SUBSIDY_SCHEME_LABEL[subsidyScheme]}
            </span>
          )}
          {subsidyStatus === 'CREDITED' && (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
              Credited
            </span>
          )}
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
        {/* No subsidy placeholder */}
        {!hasSubsidy && !editing && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-8 text-center">
            <Zap size={22} className="text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">No subsidy scheme configured</p>
            <p className="text-xs text-slate-300 mt-0.5">Click Edit to set up PM Surya Ghar or state subsidy</p>
          </div>
        )}

        {/* Stepper */}
        {(hasSubsidy || editing) && (
          <div className="flex items-start">
            {PIPELINE.map((step, idx) => {
              const stepIdx = STATUS_ORDER.indexOf(step.status);
              const done    = stepIdx < currentIdx;
              const current = step.status === (subsidyStatus ?? 'NOT_APPLIED');
              const nextStepIdx = idx < PIPELINE.length - 1 ? STATUS_ORDER.indexOf(PIPELINE[idx + 1]!.status) : -1;
              return (
                <div key={step.status} className="flex items-start flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      done
                        ? 'bg-success text-white'
                        : current
                        ? 'bg-amber-500 text-white ring-4 ring-amber-100'
                        : 'bg-slate-100 text-slate-300'
                    }`}>
                      {done ? <Check size={12} /> : idx + 1}
                    </div>
                    <span
                      className={`text-center text-[10px] leading-tight ${
                        current ? 'text-amber-600 font-semibold' : done ? 'text-slate-500' : 'text-slate-300'
                      }`}
                      style={{ maxWidth: '3.5rem' }}
                    >
                      {step.short}
                    </span>
                  </div>
                  {idx < PIPELINE.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-1 mt-3.5 ${
                        nextStepIdx <= currentIdx && currentIdx > 0 ? 'bg-success' : 'bg-slate-100'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Info summary (view mode) */}
        {!editing && hasSubsidy && (
          <div className="rounded-xl bg-slate-50 px-4 py-3 space-y-1.5">
            {subsidyAppRef && (
              <InfoRow label="Application ref" value={subsidyAppRef} mono />
            )}
            {subsidyExpectedAmtInr && parseFloat(subsidyExpectedAmtInr) > 0 && (
              <InfoRow label="Expected subsidy" value={`₹${parseFloat(subsidyExpectedAmtInr).toLocaleString('en-IN')}`} />
            )}
            {subsidyAppliedAt && <InfoRow label="Applied on" value={fmt(subsidyAppliedAt)} />}
            {subsidyInspectionAt && <InfoRow label="Inspection date" value={fmt(subsidyInspectionAt)} />}
            {subsidyApprovedAt && <InfoRow label="DISCOM approved" value={fmt(subsidyApprovedAt)} />}
            {subsidyPortalUploadAt && <InfoRow label="Portal upload" value={fmt(subsidyPortalUploadAt)} />}
            {subsidyCreditedAt && <InfoRow label="Credited on" value={fmt(subsidyCreditedAt)} />}
            {subsidyCreditedAmtInr && parseFloat(subsidyCreditedAmtInr) > 0 && (
              <InfoRow
                label="Amount credited"
                value={`₹${parseFloat(subsidyCreditedAmtInr).toLocaleString('en-IN')}`}
                valueClass="text-success font-bold"
              />
            )}
          </div>
        )}

        {/* Edit form */}
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Scheme</label>
                <div className="relative">
                  <select
                    value={scheme}
                    onChange={(e) => setScheme(e.target.value as SubsidyScheme)}
                    className="w-full appearance-none rounded-lg border border-border bg-white py-2 pl-3 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {SCHEMES.map((s) => (
                      <option key={s} value={s}>{SUBSIDY_SCHEME_LABEL[s]}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="pointer-events-none absolute right-2 top-2.5 text-slate-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                <div className="relative">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as SubsidyStatus)}
                    className="w-full appearance-none rounded-lg border border-border bg-white py-2 pl-3 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>{SUBSIDY_STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="pointer-events-none absolute right-2 top-2.5 text-slate-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Application Reference</label>
                <input
                  value={appRef}
                  onChange={(e) => setAppRef(e.target.value)}
                  placeholder="Portal application ID"
                  className="w-full rounded-lg border border-border bg-white py-2 px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Expected Subsidy (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={expectedAmt}
                  onChange={(e) => setExpectedAmt(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-border bg-white py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            {/* Milestone dates */}
            <div className="rounded-xl border border-border p-3 space-y-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Milestone Dates</span>
              <div className="grid grid-cols-2 gap-2.5">
                <DateField label="Applied on" value={appliedAt} onChange={setAppliedAt} />
                <DateField label="Inspection date" value={inspectionAt} onChange={setInspectionAt} />
                <DateField label="DISCOM approved" value={approvedAt} onChange={setApprovedAt} />
                <DateField label="Portal upload" value={portalAt} onChange={setPortalAt} />
                <DateField label="Credited on" value={creditedAt} onChange={setCreditedAt} />
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Credited Amount (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={creditedAmt}
                    onChange={(e) => setCreditedAmt(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-border bg-white py-1.5 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => void handleSave()}
              disabled={update.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {update.isPending && <Loader2 size={14} className="animate-spin" />}
              {update.isPending ? 'Saving…' : 'Save Subsidy Details'}
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
