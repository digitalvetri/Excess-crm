'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  IndianRupee, Plus, Trash2, Loader2, X, ChevronDown,
  TrendingUp, Wallet, AlertCircle, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useAddPayment,
  useDeletePayment,
  PAYMENT_TYPE_LABEL,
  type ProjectPayment,
  type ProjectPaymentType,
  type SubsidyScheme,
  type SubsidyStatus,
} from '@/hooks/use-projects';

// ── Colour config ─────────────────────────────────────────────────────────────
const TYPE_COLOR: Record<ProjectPaymentType, { bar: string; pill: string; text: string }> = {
  ADVANCE:      { bar: 'bg-blue-400',    pill: 'bg-blue-100 text-blue-700',      text: 'text-blue-600' },
  MATERIALS:    { bar: 'bg-amber-400',   pill: 'bg-amber-100 text-amber-700',    text: 'text-amber-600' },
  INSTALLATION: { bar: 'bg-indigo-400',  pill: 'bg-indigo-100 text-indigo-700',  text: 'text-indigo-600' },
  COMPLETION:   { bar: 'bg-success',     pill: 'bg-green-100 text-green-700',    text: 'text-green-600' },
  SUBSIDY:      { bar: 'bg-emerald-400', pill: 'bg-emerald-100 text-emerald-700',text: 'text-emerald-600' },
  AMC:          { bar: 'bg-violet-400',  pill: 'bg-violet-100 text-violet-700',  text: 'text-violet-600' },
  OTHER:        { bar: 'bg-slate-400',   pill: 'bg-slate-100 text-slate-600',    text: 'text-slate-500' },
};

const PAYMENT_TYPES = Object.keys(PAYMENT_TYPE_LABEL) as ProjectPaymentType[];

const PAYMENT_METHODS = [
  'Bank Transfer', 'NEFT / RTGS', 'UPI', 'Cheque', 'Cash', 'Other',
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function inr(v: number): string {
  return `₹${v.toLocaleString('en-IN')}`;
}
function lakh(v: number): string {
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  if (v >= 1000)   return `₹${(v / 1000).toFixed(1)}K`;
  return inr(v);
}

// ── Add payment form ──────────────────────────────────────────────────────────
function AddPaymentForm({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [type, setType]         = useState<ProjectPaymentType>('ADVANCE');
  const [amount, setAmount]     = useState('');
  const [receivedAt, setDate]   = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod]     = useState<string>('Bank Transfer');
  const [reference, setRef]     = useState('');
  const [notes, setNotes]       = useState('');
  const add = useAddPayment();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      await add.mutateAsync({
        id: projectId,
        type,
        amountInr: amt,
        receivedAt: new Date(receivedAt).toISOString(),
        ...(method ? { method } : {}),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      toast.success('Payment recorded');
      onClose();
    } catch {
      toast.error('Failed to record payment');
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="rounded-xl border border-primary/20 bg-primary/3 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">Record Payment</span>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X size={15} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Type */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
          <div className="relative">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ProjectPaymentType)}
              className="w-full appearance-none rounded-lg border border-border bg-white py-2 pl-3 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {PAYMENT_TYPES.map((t) => (
                <option key={t} value={t}>{PAYMENT_TYPE_LABEL[t]}</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2 top-2.5 text-slate-400" />
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Amount (₹)</label>
          <input
            type="number"
            min={1}
            step={100}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            required
            className="w-full rounded-lg border border-border bg-white py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Date Received</label>
          <input
            type="date"
            value={receivedAt}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-white py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Method */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Method</label>
          <div className="relative">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full appearance-none rounded-lg border border-border bg-white py-2 pl-3 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2 top-2.5 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Reference */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Reference / Cheque No. <span className="text-slate-300">(optional)</span>
        </label>
        <input
          value={reference}
          onChange={(e) => setRef(e.target.value)}
          placeholder="UTR / Cheque No. / Transaction ID"
          className="w-full rounded-lg border border-border bg-white py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Notes <span className="text-slate-300">(optional)</span>
        </label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any remarks…"
          className="w-full rounded-lg border border-border bg-white py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <button
        type="submit"
        disabled={add.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {add.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
        {add.isPending ? 'Saving…' : 'Record Payment'}
      </button>
    </form>
  );
}

// ── Payment row ───────────────────────────────────────────────────────────────
function PaymentRow({
  payment,
  projectId,
  totalValue,
}: {
  payment: ProjectPayment;
  projectId: string;
  totalValue: number;
}) {
  const remove        = useDeletePayment();
  const [confirm, setConfirm] = useState(false);
  const amt           = parseFloat(payment.amountInr);
  const colors        = TYPE_COLOR[payment.type];
  const pct           = totalValue > 0 ? (amt / totalValue) * 100 : 0;

  async function handleDelete() {
    if (!confirm) { setConfirm(true); return; }
    try {
      await remove.mutateAsync({ projectId, payId: payment.id });
      toast.success('Payment removed');
    } catch {
      toast.error('Delete failed');
      setConfirm(false);
    }
  }

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border bg-white px-3.5 py-3 hover:border-slate-300 transition-colors">
      {/* Type dot */}
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors.bar}`} />

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${colors.pill}`}>
            {PAYMENT_TYPE_LABEL[payment.type]}
          </span>
          <span className="text-sm font-bold text-slate-800">{inr(amt)}</span>
          <span className="text-[11px] text-slate-400">
            ({pct.toFixed(1)}% of project)
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-3 flex-wrap text-[11px] text-slate-400">
          <span>{format(new Date(payment.receivedAt), 'd MMM yyyy')}</span>
          {payment.method && <><span>·</span><span>{payment.method}</span></>}
          {payment.reference && <><span>·</span><span className="font-mono">{payment.reference}</span></>}
          {payment.notes && <><span>·</span><span className="italic">{payment.notes}</span></>}
        </div>
      </div>

      {/* Delete */}
      {confirm ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] text-danger">Remove?</span>
          <button
            onClick={() => void handleDelete()}
            disabled={remove.isPending}
            className="rounded-lg bg-danger px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-danger/90 disabled:opacity-50"
          >
            {remove.isPending ? <Loader2 size={10} className="animate-spin" /> : 'Yes'}
          </button>
          <button onClick={() => setConfirm(false)} className="text-slate-400 hover:text-slate-600">
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          onClick={handleDelete}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-danger transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ProjectPaymentTracker({
  projectId,
  totalValueInr,
  payments,
  subsidyScheme,
  subsidyStatus,
  subsidyExpectedAmtInr,
  subsidyCreditedAmtInr,
  subsidyCreditedAt,
}: {
  projectId: string;
  totalValueInr: string;
  payments: ProjectPayment[];
  subsidyScheme: SubsidyScheme;
  subsidyStatus: SubsidyStatus | null;
  subsidyExpectedAmtInr: string | null;
  subsidyCreditedAmtInr: string | null;
  subsidyCreditedAt: string | null;
}) {
  const [showForm, setShowForm] = useState(false);

  const totalValue  = parseFloat(totalValueInr) || 0;
  const collected   = payments.reduce((s, p) => s + parseFloat(p.amountInr), 0);
  const outstanding = Math.max(0, totalValue - collected);
  const payPct      = totalValue > 0 ? Math.min((collected / totalValue) * 100, 100) : 0;
  const hasSubsidy  = subsidyScheme !== 'NONE';
  const subsidyExp  = parseFloat(subsidyExpectedAmtInr ?? '0') || 0;
  const subsidyCred = parseFloat(subsidyCreditedAmtInr ?? '0') || 0;
  const subsidyCredited = subsidyStatus === 'CREDITED' || subsidyCred > 0;

  // Group collected amounts by type for breakdown bar
  const byType = payments.reduce<Partial<Record<ProjectPaymentType, number>>>((acc, p) => {
    acc[p.type] = (acc[p.type] ?? 0) + parseFloat(p.amountInr);
    return acc;
  }, {});

  const sortedPayments = [...payments].sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
  );

  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Wallet size={15} className="text-primary" />
          <h3 className="text-sm font-semibold text-slate-700">Payment Tracker</h3>
          {payments.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              {payments.length} payment{payments.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
            showForm
              ? 'bg-slate-100 text-slate-600'
              : 'bg-primary text-white hover:bg-primary/90'
          }`}
        >
          {showForm ? <X size={13} /> : <Plus size={13} />}
          {showForm ? 'Cancel' : 'Record'}
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Add form */}
        {showForm && (
          <AddPaymentForm projectId={projectId} onClose={() => setShowForm(false)} />
        )}

        {/* ── KPI strip ── */}
        <div className={`grid gap-3 ${hasSubsidy ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
          <KpiChip
            icon={<IndianRupee size={14} className="text-slate-500" />}
            label="Project Value"
            value={lakh(totalValue)}
            sub="total contract"
            bg="bg-slate-50"
          />
          <KpiChip
            icon={<TrendingUp size={14} className="text-success" />}
            label="Collected"
            value={lakh(collected)}
            sub={`${Math.round(payPct)}% of total`}
            bg="bg-success/8"
            valueClass="text-success"
          />
          <KpiChip
            icon={<AlertCircle size={14} className={outstanding > 0 ? 'text-amber-500' : 'text-slate-300'} />}
            label="Outstanding"
            value={lakh(outstanding)}
            sub={outstanding > 0 ? `${Math.round(100 - payPct)}% remaining` : 'Fully collected'}
            bg={outstanding > 0 ? 'bg-amber-50' : 'bg-slate-50'}
            valueClass={outstanding > 0 ? 'text-amber-600' : 'text-slate-400'}
          />
          {hasSubsidy && (
            <KpiChip
              icon={<Zap size={14} className={subsidyCredited ? 'text-success' : 'text-amber-500'} />}
              label="Subsidy"
              value={subsidyCredited ? lakh(subsidyCred) : (subsidyExp > 0 ? lakh(subsidyExp) : 'Expected')}
              sub={subsidyCredited
                ? (subsidyCreditedAt ? `Credited ${format(new Date(subsidyCreditedAt), 'd MMM')}` : 'Credited')
                : 'Pending credit'}
              bg={subsidyCredited ? 'bg-success/8' : 'bg-amber-50'}
              valueClass={subsidyCredited ? 'text-success' : 'text-amber-600'}
            />
          )}
        </div>

        {/* Collection progress bar */}
        {totalValue > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5 text-xs text-slate-500">
              <span>Collection progress</span>
              <span className="font-semibold text-slate-700">{Math.round(payPct)}%</span>
            </div>
            {/* Segmented bar by payment type */}
            {collected > 0 ? (
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 gap-px">
                {(Object.keys(byType) as ProjectPaymentType[]).map((type) => {
                  const amt = byType[type] ?? 0;
                  const w   = (amt / totalValue) * 100;
                  return (
                    <div
                      key={type}
                      style={{ width: `${w}%` }}
                      className={`${TYPE_COLOR[type].bar} first:rounded-l-full`}
                      title={`${PAYMENT_TYPE_LABEL[type]}: ${inr(amt)}`}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="h-2.5 w-full rounded-full bg-slate-100" />
            )}
            {/* Type legend — only show types that have payments */}
            {collected > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {(Object.entries(byType) as [ProjectPaymentType, number][]).map(([type, amt]) => (
                  <div key={type} className="flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${TYPE_COLOR[type].bar}`} />
                    <span className="text-[11px] text-slate-500">
                      {PAYMENT_TYPE_LABEL[type]}
                      <span className="ml-1 font-semibold text-slate-700">{lakh(amt)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Payment history ── */}
        {sortedPayments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
            <Wallet size={24} className="text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">No payments recorded yet</p>
            <p className="text-xs text-slate-300 mt-0.5">Click "Record" to add the first payment</p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payment History</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-2">
              {sortedPayments.map((p) => (
                <PaymentRow key={p.id} payment={p} projectId={projectId} totalValue={totalValue} />
              ))}
            </div>
          </div>
        )}

        {/* ── Financial summary footer ── */}
        {totalValue > 0 && payments.length > 0 && (
          <div className="rounded-xl border border-border bg-slate-50/60 px-4 py-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <SummaryRow label="Gross Contract Value" value={inr(totalValue)} />
              <SummaryRow label="Total Collected" value={inr(collected)} valueClass="text-success font-semibold" />
              <SummaryRow label="Balance Outstanding" value={inr(outstanding)} valueClass={outstanding > 0 ? 'text-amber-600 font-semibold' : 'text-success font-semibold'} />
              {hasSubsidy && subsidyExp > 0 && (
                <SummaryRow
                  label="Subsidy Expected"
                  value={inr(subsidyExp)}
                  valueClass="text-amber-600"
                />
              )}
              {hasSubsidy && subsidyCred > 0 && (
                <SummaryRow
                  label="Subsidy Credited"
                  value={inr(subsidyCred)}
                  valueClass="text-success font-semibold"
                />
              )}
              {hasSubsidy && subsidyCred > 0 && (
                <SummaryRow
                  label="Net Revenue"
                  value={inr(collected - subsidyCred)}
                  valueClass="text-primary font-bold"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KpiChip({
  icon, label, value, sub, bg, valueClass = 'text-slate-800',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  bg: string;
  valueClass?: string;
}) {
  return (
    <div className={`rounded-xl p-3 ${bg}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[11px] text-slate-500 font-medium truncate">{label}</span>
      </div>
      <div className={`text-base font-bold ${valueClass}`}>{value}</div>
      <div className="text-[10px] text-slate-400 mt-0.5 truncate">{sub}</div>
    </div>
  );
}

function SummaryRow({
  label, value, valueClass = 'text-slate-700',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <>
      <span className="text-slate-500">{label}</span>
      <span className={`text-right ${valueClass}`}>{value}</span>
    </>
  );
}
