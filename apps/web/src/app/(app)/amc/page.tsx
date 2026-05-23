'use client';

import { useState } from 'react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import Link from 'next/link';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import {
  ClipboardList, Plus, AlertTriangle, CheckCircle2, XCircle,
  RefreshCw, Loader2, X, CalendarCheck,
} from 'lucide-react';
import {
  useAmcContracts,
  useCreateAmcContract,
  useCancelAmcContract,
  useRenewAmcContract,
  useBulkRenewAmc,
  type AmcContract,
  type AmcWindow,
} from '@/hooks/use-amc-contracts';
import { useProjects } from '@/hooks/use-projects';
import { getApiErrorMessage } from '@/lib/api-error';

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysLeft(endDate: string): number {
  return differenceInDays(new Date(endDate), new Date());
}

function statusChip(contract: AmcContract) {
  if (contract.status === 'RENEWED')   return { label: 'Renewed',   cls: 'bg-blue-100 text-blue-700' };
  if (contract.status === 'CANCELLED') return { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500' };
  const left = daysLeft(contract.endDate);
  if (left < 0)   return { label: 'Expired',          cls: 'bg-red-100 text-danger' };
  if (left <= 30) return { label: `${left}d left`,    cls: 'bg-amber-100 text-amber-700' };
  return                 { label: `${left}d left`,    cls: 'bg-green-100 text-success' };
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, cls }: {
  label: string; value: number | string;
  icon: React.ElementType; cls: string;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-white p-5 flex items-center gap-4`}>
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${cls}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────
function CreateAmcModal({ onClose }: { onClose: () => void }) {
  const modalRef = useFocusTrap(onClose);
  const { data: projectData } = useProjects();
  const projects = projectData?.projects ?? [];
  const create   = useCreateAmcContract();

  const [projectId, setProjectId] = useState('');
  const [planYears, setPlanYears] = useState(1);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [valueInr, setValueInr]   = useState('');
  const [notes, setNotes]         = useState('');

  async function handleSave() {
    if (!projectId) { toast.error('Select a project'); return; }
    try {
      await create.mutateAsync({
        projectId, planYears, startDate,
        ...(valueInr ? { valueInr: Number(valueInr) } : {}),
        ...(notes    ? { notes }                       : {}),
      });
      toast.success('AMC contract created');
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to create contract'));
    }
  }

  const endDate = (() => {
    const d = new Date(startDate);
    d.setFullYear(d.getFullYear() + planYears);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="New AMC Contract" className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-slate-900">New AMC Contract</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Project / Customer">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.number} — {p.lead.name}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Plan">
              <select
                value={planYears}
                onChange={(e) => setPlanYears(Number(e.target.value))}
                className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {[1, 2, 3, 5].map((y) => (
                  <option key={y} value={y}>{y} Year{y > 1 ? 's' : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="Annual Value (₹)">
              <input
                type="number"
                value={valueInr}
                onChange={(e) => setValueInr(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full text-sm border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </Field>
          </div>

          <Field label="Start Date">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-sm border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>

          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Ends on <span className="font-semibold text-slate-700">{format(new Date(endDate), 'd MMM yyyy')}</span>
          </div>

          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={2000}
              className="w-full text-sm border border-border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          <button
            onClick={() => void handleSave()}
            disabled={create.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {create.isPending && <Loader2 size={14} className="animate-spin" />}
            Create Contract
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Renew modal ───────────────────────────────────────────────────────────────
function RenewModal({ contract, onClose }: { contract: AmcContract; onClose: () => void }) {
  const modalRef = useFocusTrap(onClose);
  const renew = useRenewAmcContract();
  const [planYears, setPlanYears] = useState(contract.planYears);
  const [valueInr, setValueInr]   = useState(contract.valueInr ?? '');
  const [notes, setNotes]         = useState('');

  const newStart = new Date(contract.endDate);
  newStart.setDate(newStart.getDate() + 1);
  const newEnd = new Date(newStart);
  newEnd.setFullYear(newEnd.getFullYear() + planYears);

  async function handleRenew() {
    try {
      await renew.mutateAsync({
        id: contract.id,
        data: {
          planYears,
          ...(valueInr ? { valueInr: Number(valueInr) } : {}),
          ...(notes    ? { notes }                       : {}),
        },
      });
      toast.success('Contract renewed');
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Renewal failed'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label={`Renew AMC ${contract.project.number}`} className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-slate-900">Renew AMC — {contract.project.number}</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Current contract ends <span className="font-semibold text-slate-700">{format(new Date(contract.endDate), 'd MMM yyyy')}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Renewal Plan">
              <select
                value={planYears}
                onChange={(e) => setPlanYears(Number(e.target.value))}
                className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {[1, 2, 3, 5].map((y) => (
                  <option key={y} value={y}>{y} Year{y > 1 ? 's' : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="Annual Value (₹)">
              <input
                type="number"
                value={valueInr}
                onChange={(e) => setValueInr(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full text-sm border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </Field>
          </div>
          <div className="rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-xs text-success">
            New contract: <span className="font-semibold">{format(newStart, 'd MMM yyyy')}</span> → <span className="font-semibold">{format(newEnd, 'd MMM yyyy')}</span>
          </div>
          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={2000}
              className="w-full text-sm border border-border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          <button
            onClick={() => void handleRenew()}
            disabled={renew.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {renew.isPending && <Loader2 size={14} className="animate-spin" />}
            Renew Contract
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const WINDOWS: { key: AmcWindow; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'active',     label: 'Active' },
  { key: 'expiring30', label: 'Expiring 30d' },
  { key: 'expired',    label: 'Expired' },
  { key: 'renewed',    label: 'Renewed' },
  { key: 'cancelled',  label: 'Cancelled' },
];

const BULK_WINDOWS: AmcWindow[] = ['expiring30', 'expiring60', 'expired'];

export default function AmcPage() {
  const [window, setWindow]           = useState<AmcWindow>('all');
  const [showCreate, setCreate]       = useState(false);
  const [renewTarget, setRenew]       = useState<AmcContract | null>(null);
  const [selectedAmcIds, setSelAmc]   = useState<Set<string>>(new Set());
  const [bulkPlanYears, setBulkYears] = useState(1);
  const cancel    = useCancelAmcContract();
  const bulkRenew = useBulkRenewAmc();
  const bulkMode  = BULK_WINDOWS.includes(window);

  const { data, isLoading, isError } = useAmcContracts({ window });
  const contracts = data?.contracts ?? [];
  const stats     = data?.stats;

  async function handleCancel(id: string) {
    try {
      await cancel.mutateAsync(id);
      toast.success('Contract cancelled');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Cancel failed'));
    }
  }

  function toggleAmcSelect(id: string) {
    setSelAmc((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAmcAll() {
    setSelAmc(contracts.length > 0 && selectedAmcIds.size === contracts.length
      ? new Set()
      : new Set(contracts.map((c) => c.id)));
  }

  async function applyBulkRenew() {
    if (selectedAmcIds.size === 0) return;
    try {
      const result = await bulkRenew.mutateAsync({ ids: [...selectedAmcIds], planYears: bulkPlanYears });
      const renewed = (result as { data?: { renewed?: number } }).data?.renewed ?? selectedAmcIds.size;
      toast.success(`Renewed ${renewed} contract${renewed > 1 ? 's' : ''}`);
      setSelAmc(new Set());
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Bulk renewal failed'));
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">AMC Contracts</h1>
          <p className="text-sm text-slate-500 mt-1">Annual Maintenance Contracts — track, renew, and manage service agreements.</p>
        </div>
        <button
          onClick={() => setCreate(true)}
          className="inline-flex items-center gap-1.5 text-sm bg-primary text-white px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} /> New Contract
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Active"         value={stats.active}     icon={CheckCircle2}  cls="bg-green-100 text-success" />
          <StatCard label="Expiring 30d"   value={stats.expiring30} icon={AlertTriangle}  cls="bg-amber-100 text-amber-600" />
          <StatCard label="Expired"        value={stats.expired}    icon={XCircle}        cls="bg-red-100 text-danger" />
          <StatCard label="Renewed"        value={stats.renewed}    icon={RefreshCw}      cls="bg-blue-100 text-primary" />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap" role="tablist">
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            role="tab"
            aria-selected={window === w.key}
            onClick={() => { setWindow(w.key); setSelAmc(new Set()); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              window === w.key ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* Bulk renew bar */}
      {bulkMode && selectedAmcIds.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
          <span className="text-sm font-semibold text-primary">{selectedAmcIds.size} selected</span>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Renew for</label>
            <select
              value={bulkPlanYears}
              onChange={(e) => setBulkYears(Number(e.target.value))}
              className="text-sm border border-border rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {[1, 2, 3, 5].map((y) => <option key={y} value={y}>{y} yr{y > 1 ? 's' : ''}</option>)}
            </select>
            <button
              onClick={() => void applyBulkRenew()}
              disabled={bulkRenew.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {bulkRenew.isPending && <Loader2 size={12} className="animate-spin" />}
              Renew All
            </button>
            <button onClick={() => setSelAmc(new Set())} className="text-sm text-slate-500 hover:text-slate-700">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate  && <CreateAmcModal onClose={() => setCreate(false)} />}
      {renewTarget && <RenewModal contract={renewTarget} onClose={() => setRenew(null)} />}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-white rounded-xl border border-border animate-pulse" />)}
        </div>
      ) : isError ? (
        <p className="text-danger text-sm">Failed to load contracts. Please refresh.</p>
      ) : contracts.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 flex flex-col items-center text-center">
          <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <ClipboardList size={26} className="text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 mb-1">No AMC contracts yet</h3>
          <p className="text-sm text-slate-500 mb-5 max-w-xs">Create annual maintenance contracts for installed solar systems to track service schedules and renewals.</p>
          <button
            onClick={() => setCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            + Create First Contract
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-border">
              <tr>
                {bulkMode && (
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all contracts"
                      checked={contracts.length > 0 && selectedAmcIds.size === contracts.length}
                      onChange={toggleAmcAll}
                      className="rounded border-slate-300 text-primary focus:ring-primary/30"
                    />
                  </th>
                )}
                {['Project', 'Customer', 'Plan', 'Start', 'End', 'Value', 'Status', 'Actions'].map((col) => (
                  <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contracts.map((c) => {
                const chip = statusChip(c);
                const canRenew = c.status === 'ACTIVE' && daysLeft(c.endDate) <= 60;
                return (
                  <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${selectedAmcIds.has(c.id) ? 'bg-primary/[0.03]' : ''}`}>
                    {bulkMode && (
                      <td className="px-4 py-3 w-8">
                        <input
                          type="checkbox"
                          aria-label={`Select contract for ${c.project.number}`}
                          checked={selectedAmcIds.has(c.id)}
                          onChange={() => toggleAmcSelect(c.id)}
                          className="rounded border-slate-300 text-primary focus:ring-primary/30"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/projects/${c.project.id}`} className="font-medium text-primary hover:underline text-sm">
                        {c.project.number}
                      </Link>
                      <div className="text-[11px] text-slate-400">{c.project.systemKw} kW</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-slate-800 font-medium text-sm">{c.lead.name}</div>
                      <div className="text-xs text-slate-400">{c.lead.phone}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 text-xs">
                      {c.planYears}yr
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 text-xs">
                      <span className="inline-flex items-center gap-1">
                        <CalendarCheck size={11} className="text-slate-400" />
                        {format(new Date(c.startDate), 'd MMM yyyy')}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 text-xs">
                      {format(new Date(c.endDate), 'd MMM yyyy')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700 text-xs font-medium">
                      {c.valueInr ? `₹${Number(c.valueInr).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${chip.cls}`}>
                        {chip.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/amc/${c.id}`}
                          className="text-[11px] text-slate-400 hover:text-primary transition-colors"
                        >
                          View
                        </Link>
                        {canRenew && (
                          <button
                            onClick={() => setRenew(c)}
                            className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 transition-colors"
                          >
                            <RefreshCw size={10} /> Renew
                          </button>
                        )}
                        {c.status === 'ACTIVE' && (
                          <button
                            onClick={() => void handleCancel(c.id)}
                            disabled={cancel.isPending}
                            className="text-[11px] text-slate-400 hover:text-danger transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
