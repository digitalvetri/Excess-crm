'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, Phone, MapPin, Mail, ExternalLink, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import { useAmcContract, useCancelAmcContract, useRenewAmcContract, type AmcStatus } from '@/hooks/use-amc-contracts';

const STATUS_CHIP: Record<AmcStatus, string> = {
  ACTIVE:    'bg-green-100 text-green-700',
  RENEWED:   'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

function daysLeft(endDate: string) {
  return differenceInDays(new Date(endDate), new Date());
}

function statusChip(status: AmcStatus, endDate: string) {
  if (status === 'RENEWED')   return { label: 'Renewed',   cls: STATUS_CHIP.RENEWED };
  if (status === 'CANCELLED') return { label: 'Cancelled', cls: STATUS_CHIP.CANCELLED };
  const d = daysLeft(endDate);
  if (d < 0)   return { label: 'Expired',        cls: 'bg-red-100 text-red-700' };
  if (d <= 30) return { label: `Expiring in ${d}d`, cls: 'bg-amber-100 text-amber-700' };
  return { label: 'Active', cls: STATUS_CHIP.ACTIVE };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <div className="text-sm text-slate-800 font-medium">{children}</div>
    </div>
  );
}

export default function AmcDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: contract, isLoading, isError } = useAmcContract(id);
  const cancel = useCancelAmcContract();
  const renew  = useRenewAmcContract();

  async function handleCancel() {
    if (!confirm('Cancel this AMC contract?')) return;
    try {
      await cancel.mutateAsync(id);
      toast.success('Contract cancelled');
    } catch {
      toast.error('Could not cancel contract');
    }
  }

  async function handleRenew() {
    if (!contract) return;
    try {
      await renew.mutateAsync({ id, data: { planYears: contract.planYears, ...(contract.valueInr ? { valueInr: Number(contract.valueInr) } : {}) } });
      toast.success('Contract renewed for another year');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Could not renew contract');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-white rounded-2xl border border-border animate-pulse" />)}
      </div>
    );
  }

  if (isError || !contract) {
    return (
      <div className="bg-white rounded-2xl border border-border p-10 text-center">
        <p className="text-sm text-danger">Contract not found or failed to load.</p>
        <Link href="/amc" className="text-xs text-primary hover:underline mt-2 block">← Back to AMC Contracts</Link>
      </div>
    );
  }

  const chip     = statusChip(contract.status, contract.endDate);
  const canRenew = contract.status === 'ACTIVE';
  const canCancel = contract.status === 'ACTIVE';

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/amc" className="text-slate-400 hover:text-primary transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <h1 className="text-xl font-bold text-slate-900">AMC Contract</h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${chip.cls}`}>
              {chip.label}
            </span>
          </div>
          <p className="text-sm text-slate-500 ml-6">
            Project{' '}
            <Link href={`/projects/${contract.project.id}`} className="text-primary hover:underline font-medium">
              {contract.project.number}
            </Link>
            {' · '}
            {contract.planYears} year{contract.planYears > 1 ? 's' : ''}
            {' · '}
            Created {format(new Date(contract.createdAt), 'd MMM yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canRenew && (
            <button
              onClick={() => void handleRenew()}
              disabled={renew.isPending}
              className="inline-flex items-center gap-1.5 text-sm bg-primary text-white px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} /> Renew
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => void handleCancel()}
              disabled={cancel.isPending}
              className="inline-flex items-center gap-1.5 text-sm border border-red-200 text-danger px-4 py-2 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <XCircle size={14} /> Cancel
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Contract details */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-border p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Contract Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start Date">{format(new Date(contract.startDate), 'd MMM yyyy')}</Field>
              <Field label="End Date">{format(new Date(contract.endDate), 'd MMM yyyy')}</Field>
              <Field label="Plan Duration">{contract.planYears} year{contract.planYears > 1 ? 's' : ''}</Field>
              <Field label="Annual Value">
                {contract.valueInr ? `₹${Number(contract.valueInr).toLocaleString('en-IN')}` : <span className="text-slate-300">—</span>}
              </Field>
              <Field label="System Size">{contract.project.systemKw} kWp</Field>
              <Field label="Project Stage">
                <span className="capitalize">{contract.project.stage.toLowerCase().replace(/_/g, ' ')}</span>
              </Field>
              {contract.createdByUserName && (
                <Field label="Created By">{contract.createdByUserName}</Field>
              )}
            </div>
            {contract.notes && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-slate-400 mb-1">Notes</p>
                <p className="text-sm text-slate-700 whitespace-pre-line">{contract.notes}</p>
              </div>
            )}
          </div>

          {/* Renewal history */}
          {contract.history.length > 1 && (
            <div className="bg-white rounded-2xl border border-border p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <ClipboardList size={15} className="text-slate-400" /> Renewal History
              </h2>
              <div className="space-y-2">
                {contract.history.map((h, i) => {
                  const isCurrentPage = h.id === id;
                  return (
                    <div
                      key={h.id}
                      className={`flex items-center justify-between p-3 rounded-xl border ${isCurrentPage ? 'border-primary/30 bg-primary/5' : 'border-border'}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-400 w-6">#{i + 1}</span>
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {format(new Date(h.startDate), 'd MMM yyyy')} – {format(new Date(h.endDate), 'd MMM yyyy')}
                          </p>
                          <p className="text-xs text-slate-400">{h.planYears}yr{h.valueInr ? ` · ₹${Number(h.valueInr).toLocaleString('en-IN')}` : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[h.status]}`}>
                          {h.status === 'RENEWED' ? 'Renewed' : h.status === 'CANCELLED' ? 'Cancelled' : 'Active'}
                        </span>
                        {!isCurrentPage && (
                          <Link href={`/amc/${h.id}`} className="text-slate-400 hover:text-primary transition-colors">
                            <ExternalLink size={13} />
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Customer & Project sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-border p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Customer</h2>
            <p className="text-sm font-semibold text-slate-900">{contract.lead.name}</p>
            <div className="mt-3 space-y-2">
              <a href={`tel:${contract.lead.phone}`} className="flex items-center gap-2 text-xs text-slate-500 hover:text-primary transition-colors">
                <Phone size={12} /> {contract.lead.phone}
              </a>
              {contract.lead.email && (
                <a href={`mailto:${contract.lead.email}`} className="flex items-center gap-2 text-xs text-slate-500 hover:text-primary transition-colors">
                  <Mail size={12} /> {contract.lead.email}
                </a>
              )}
              {contract.lead.city && (
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  <MapPin size={12} /> {contract.lead.city}
                </span>
              )}
            </div>
            <Link
              href={`/leads/${contract.lead.id}`}
              className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View lead profile <ExternalLink size={11} />
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-border p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Project</h2>
            <Link
              href={`/projects/${contract.project.id}`}
              className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
            >
              {contract.project.number} <ExternalLink size={12} />
            </Link>
            <p className="text-xs text-slate-500 mt-1">{contract.project.systemKw} kWp · {contract.project.stage.replace(/_/g, ' ')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
