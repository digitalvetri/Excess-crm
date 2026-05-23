'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Wrench, Plus, CalendarClock, Clock, AlertTriangle, CalendarDays, BarChart3, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useServiceTickets,
  useUpdateServiceTicket,
  useServiceTicketAlerts,
  useBulkUpdateTickets,
  useEngineers,
  SERVICE_TICKET_STATUSES,
  SLA_RESOLVE_HOURS,
  TYPE_LABEL,
  STATUS_LABEL,
  type ServiceTicketStatus,
} from '@/hooks/use-service-tickets';
import { RaiseTicketModal } from '@/components/service-tickets/raise-ticket-modal';
import { getApiErrorMessage } from '@/lib/api-error';

const STATUS_BADGE: Record<ServiceTicketStatus, string> = {
  OPEN:        'bg-amber-100 text-amber-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  RESOLVED:    'bg-green-100 text-green-700',
  CLOSED:      'bg-slate-100 text-slate-600',
};

const PRIORITY_BADGE: Record<string, string> = {
  P1: 'bg-red-100 text-red-700',
  P2: 'bg-orange-100 text-orange-700',
  P3: 'bg-slate-100 text-slate-600',
  P4: 'bg-slate-50 text-slate-500',
};

export default function ServiceTicketsPage() {
  const [statusFilter, setStatusFilter] = useState<ServiceTicketStatus | 'ALL'>('ALL');
  const [showForm, setShowForm]         = useState(false);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [bulkEngId, setBulkEngId]       = useState('');
  const [bulkStatus, setBulkStatus]     = useState<ServiceTicketStatus | ''>('');

  const { data, isLoading, isError } = useServiceTickets(
    statusFilter !== 'ALL' ? { status: statusFilter } : undefined,
  );
  const tickets    = data?.tickets ?? [];
  const update     = useUpdateServiceTicket();
  const bulkUpdate = useBulkUpdateTickets();
  const { data: alerts }     = useServiceTicketAlerts();
  const { data: engineers }  = useEngineers();

  async function changeStatus(id: string, status: ServiceTicketStatus) {
    try {
      await update.mutateAsync({ id, data: { status } });
      toast.success(`Marked ${STATUS_LABEL[status].toLowerCase()}`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Status update failed'));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(tickets.length > 0 && selectedIds.size === tickets.length
      ? new Set()
      : new Set(tickets.map((t) => t.id)));
  }

  async function applyBulk() {
    if (selectedIds.size === 0) return;
    const payload: { assignedEngineerId?: string | null; status?: ServiceTicketStatus } = {};
    if (bulkEngId === '__none__')   payload.assignedEngineerId = null;
    else if (bulkEngId !== '')      payload.assignedEngineerId = bulkEngId;
    if (bulkStatus !== '')          payload.status = bulkStatus as ServiceTicketStatus;
    if (Object.keys(payload).length === 0) { toast.error('Select an action to apply'); return; }
    try {
      await bulkUpdate.mutateAsync({ ids: [...selectedIds], data: payload });
      toast.success(`Updated ${selectedIds.size} ticket${selectedIds.size > 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      setBulkEngId('');
      setBulkStatus('');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Bulk update failed'));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Service Tickets</h1>
          <p className="text-sm text-slate-500 mt-1">AMC visits, warranty claims and post-install support.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/service-tickets/analytics"
            className="inline-flex items-center gap-1.5 text-sm border border-border px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <BarChart3 size={15} /> Analytics
          </Link>
          <Link
            href="/service-tickets/schedule"
            className="inline-flex items-center gap-1.5 text-sm border border-border px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <CalendarDays size={15} /> Schedule
          </Link>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 text-sm bg-primary text-white px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} /> New Ticket
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap" role="tablist">
        {(['ALL', ...SERVICE_TICKET_STATUSES] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={statusFilter === s}
            onClick={() => { setStatusFilter(s); setSelectedIds(new Set()); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === s ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s === 'ALL' ? 'All' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
          <span className="text-sm font-semibold text-primary">{selectedIds.size} selected</span>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={bulkEngId}
              onChange={(e) => setBulkEngId(e.target.value)}
              className="text-sm border border-border rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Assign engineer…</option>
              <option value="__none__">Unassign</option>
              {(engineers ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as ServiceTicketStatus | '')}
              className="text-sm border border-border rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Change status…</option>
              {SERVICE_TICKET_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button
              onClick={() => void applyBulk()}
              disabled={bulkUpdate.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {bulkUpdate.isPending && <Loader2 size={12} className="animate-spin" />}
              Apply
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="text-sm text-slate-500 hover:text-slate-700">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* SLA alert banner */}
      {alerts && (alerts.overdueCount > 0 || alerts.unassignedP1Count > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
          <div className="text-sm text-danger">
            {alerts.overdueCount > 0 && (
              <span className="font-semibold">{alerts.overdueCount} ticket{alerts.overdueCount > 1 ? 's' : ''} overdue</span>
            )}
            {alerts.overdueCount > 0 && alerts.unassignedP1Count > 0 && <span> · </span>}
            {alerts.unassignedP1Count > 0 && (
              <span className="font-semibold">{alerts.unassignedP1Count} P1 ticket{alerts.unassignedP1Count > 1 ? 's' : ''} unassigned</span>
            )}
            <span className="text-red-400 ml-1">— action required</span>
          </div>
        </div>
      )}

      {showForm && <RaiseTicketModal onClose={() => setShowForm(false)} />}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white rounded-xl border border-border animate-pulse" />)}
        </div>
      ) : isError ? (
        <p className="text-danger text-sm">Failed to load service tickets. Please refresh.</p>
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 sm:p-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Wrench size={28} className="text-slate-400" />
          </div>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">
            {statusFilter !== 'ALL' ? `No ${STATUS_LABEL[statusFilter as ServiceTicketStatus]} tickets` : 'No service tickets yet'}
          </h3>
          <p className="text-xs text-slate-400 mb-5 max-w-xs mx-auto">
            {statusFilter !== 'ALL'
              ? 'Try switching to a different status filter.'
              : 'When customers report issues after installation, tickets will appear here.'}
          </p>
          {statusFilter === 'ALL' && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
            >
              <Plus size={14} />
              Raise First Ticket
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-border">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all tickets"
                    checked={tickets.length > 0 && selectedIds.size === tickets.length}
                    onChange={toggleAll}
                    className="rounded border-slate-300 text-primary focus:ring-primary/30"
                  />
                </th>
                {['Subject', 'Customer', 'Type', 'Project', 'Priority', 'SLA', 'Visit', 'Status'].map((col) => (
                  <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tickets.map((t) => {
                const hours   = SLA_RESOLVE_HOURS[t.priority] ?? 120;
                const age     = (Date.now() - new Date(t.createdAt).getTime()) / 3600000;
                const left    = hours - age;
                const open    = t.status !== 'RESOLVED' && t.status !== 'CLOSED';
                const overdue = open && left < 0;
                const atRisk  = open && !overdue && left < hours * 0.25;
                return (
                  <tr key={t.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(t.id) ? 'bg-primary/[0.03]' : ''}`}>
                    <td className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        aria-label={`Select ticket ${t.subject}`}
                        checked={selectedIds.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        className="rounded border-slate-300 text-primary focus:ring-primary/30"
                      />
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <Link href={`/service-tickets/${t.id}`} className="font-medium text-slate-900 hover:text-primary transition-colors block truncate">
                        {t.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-slate-800 font-medium">{t.lead.name}</div>
                      <div className="text-xs text-slate-400">{t.lead.phone}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 text-xs">{TYPE_LABEL[t.type]}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {t.project ? (
                        <Link href={`/projects/${t.project.id}`} className="text-primary hover:underline text-xs">
                          {t.project.number}
                        </Link>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${PRIORITY_BADGE[t.priority] ?? 'bg-slate-100 text-slate-600'}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {open ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${overdue ? 'bg-red-50 text-danger' : atRisk ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'}`}>
                          <Clock size={9} />
                          {overdue ? `${Math.abs(Math.round(left))}h over` : `${Math.round(left)}h left`}
                        </span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {t.scheduledVisitAt ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <CalendarClock size={12} className="text-slate-400" />
                          {new Date(t.scheduledVisitAt).toLocaleDateString('en-IN')}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <select
                        value={t.status}
                        onChange={(e) => void changeStatus(t.id, e.target.value as ServiceTicketStatus)}
                        className={`text-xs font-semibold rounded-full px-2.5 py-1 border-0 cursor-pointer focus:outline-none ${STATUS_BADGE[t.status]}`}
                      >
                        {SERVICE_TICKET_STATUSES.map((s) => (
                          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                      </select>
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
