'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuotations, useSendQuotation } from '@/hooks/use-quotations';

type StatusFilter = 'ALL' | 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SENT: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const SEND_VIA_OPTIONS: { value: string; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
];

export default function QuotationsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVia, setSelectedVia] = useState<string>('whatsapp');
  const [sendError, setSendError] = useState<string | null>(null);

  const { quotations, loading, error } = useQuotations(
    statusFilter !== 'ALL' ? { status: statusFilter } : undefined,
  );
  const { send, loading: sending } = useSendQuotation();

  async function handleSend() {
    if (!selectedId) return;
    setSendError(null);
    try {
      await send(selectedId, selectedVia);
      setSelectedId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send';
      setSendError(msg);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Quotations</h1>
        <Link
          href="/quotations/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          New Quotation
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        {(['ALL', 'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'] as StatusFilter[]).map(
          (s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ),
        )}
      </div>

      {/* Send confirm dialog */}
      {selectedId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Send Quotation</h2>
            <div className="space-y-2">
              {SEND_VIA_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="via"
                    value={opt.value}
                    checked={selectedVia === opt.value}
                    onChange={() => setSelectedVia(opt.value)}
                    className="accent-primary"
                  />
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              ))}
            </div>
            {sendError && (
              <p className="text-sm text-red-600">{sendError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setSelectedId(null); setSendError(null); }}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : error ? (
        <p className="text-red-600 text-sm">{error}</p>
      ) : quotations.length === 0 ? (
        <p className="text-slate-500 text-sm">No quotations found</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-border">
              <tr>
                {[
                  'Number',
                  'Lead',
                  'System (kW)',
                  'Brand Tier',
                  'Total (₹)',
                  'Net Payable (₹)',
                  'Status',
                  'Sent Via',
                  'Date',
                  '',
                ].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left font-semibold text-slate-600 whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {quotations.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/leads/${q.leadId}`}
                      className="text-primary font-medium hover:underline"
                    >
                      {q.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-medium text-slate-900">
                      {q.lead?.name ?? '—'}
                    </div>
                    <div className="text-xs text-slate-500">{q.lead?.phone ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                    {parseFloat(q.systemKw).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                    {q.brandTier.charAt(0) + q.brandTier.slice(1).toLowerCase()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                    ₹{parseFloat(q.totalInr).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                    ₹{parseFloat(q.netPayable).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[q.status] ?? 'bg-slate-100 text-slate-700'}`}
                    >
                      {q.status.charAt(0) + q.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                    {q.sentVia ?? '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                    {new Date(q.createdAt).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {q.status === 'DRAFT' && (
                      <button
                        onClick={() => { setSelectedId(q.id); setSendError(null); }}
                        className="px-3 py-1 text-xs rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors font-medium"
                      >
                        Send
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
