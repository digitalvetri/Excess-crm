'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Wrench, Plus, Loader2, X, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import {
  useServiceTickets,
  useCreateServiceTicket,
  useUpdateServiceTicket,
  SERVICE_TICKET_STATUSES,
  SERVICE_TICKET_TYPES,
  TYPE_LABEL,
  type ServiceTicketStatus,
  type ServiceTicketType,
} from '@/hooks/use-service-tickets';
import { useProjects } from '@/hooks/use-projects';

const STATUS_BADGE: Record<ServiceTicketStatus, string> = {
  OPEN: 'bg-amber-100 text-amber-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-slate-100 text-slate-600',
};

const PRIORITY_BADGE: Record<string, string> = {
  P1: 'bg-red-100 text-red-700',
  P2: 'bg-orange-100 text-orange-700',
  P3: 'bg-slate-100 text-slate-600',
  P4: 'bg-slate-100 text-slate-500',
};

export default function ServiceTicketsPage() {
  const [statusFilter, setStatusFilter] = useState<ServiceTicketStatus | 'ALL'>('ALL');
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError } = useServiceTickets(
    statusFilter !== 'ALL' ? { status: statusFilter } : undefined,
  );
  const tickets = data?.tickets ?? [];
  const update = useUpdateServiceTicket();

  async function changeStatus(id: string, status: ServiceTicketStatus) {
    try {
      await update.mutateAsync({ id, data: { status } });
      toast.success(`Marked ${status.replace('_', ' ').toLowerCase()}`);
    } catch {
      toast.error('Update failed');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Service Tickets</h1>
          <p className="text-sm text-slate-500 mt-1">
            AMC visits, warranty claims and post-install support.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} /> New Ticket
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(['ALL', ...SERVICE_TICKET_STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-primary text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s === 'ALL' ? 'All' : s.replace('_', ' ').charAt(0) + s.replace('_', ' ').slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {showForm && <CreateTicketModal onClose={() => setShowForm(false)} />}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-white rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-danger text-sm">Failed to load service tickets. Please refresh.</p>
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-10 text-center">
          <Wrench size={26} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No service tickets.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-border">
              <tr>
                {['Subject', 'Customer', 'Type', 'Project', 'Priority', 'Visit', 'Status'].map((col) => (
                  <th key={col} className="px-4 py-3 text-left font-semibold text-slate-600 whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 max-w-[240px]">
                    <div className="font-medium text-slate-900 truncate">{t.subject}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-slate-800">{t.lead.name}</div>
                    <div className="text-xs text-slate-500">{t.lead.phone}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{TYPE_LABEL[t.type]}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {t.project ? (
                      <Link href={`/projects/${t.project.id}`} className="text-primary hover:underline">
                        {t.project.number}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_BADGE[t.priority] ?? 'bg-slate-100 text-slate-600'}`}>
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {t.scheduledVisitAt ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock size={13} className="text-slate-400" />
                        {new Date(t.scheduledVisitAt).toLocaleDateString('en-IN')}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <select
                      value={t.status}
                      onChange={(e) => void changeStatus(t.id, e.target.value as ServiceTicketStatus)}
                      className={`text-xs font-medium rounded-full px-2.5 py-1 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary ${STATUS_BADGE[t.status]}`}
                    >
                      {SERVICE_TICKET_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
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

function CreateTicketModal({ onClose }: { onClose: () => void }) {
  const { data: projectData } = useProjects();
  const projects = projectData?.projects ?? [];
  const create = useCreateServiceTicket();

  const [projectId, setProjectId] = useState('');
  const [type, setType] = useState<ServiceTicketType>('COMPLAINT');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('P3');
  const [scheduledVisitAt, setScheduledVisitAt] = useState('');

  async function handleSave() {
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      toast.error('Select a project');
      return;
    }
    if (!subject.trim() || !description.trim()) {
      toast.error('Subject and description are required');
      return;
    }
    try {
      await create.mutateAsync({
        leadId: project.lead.id,
        projectId: project.id,
        type,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        ...(scheduledVisitAt && { scheduledVisitAt: new Date(scheduledVisitAt).toISOString() }),
      });
      toast.success('Service ticket created');
      onClose();
    } catch {
      toast.error('Failed to create ticket');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-slate-900">New Service Ticket</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Project / Customer">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number} — {p.lead.name}
                </option>
              ))}
            </select>
            {projects.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">No projects yet — service tickets attach to install projects.</p>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ServiceTicketType)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                {SERVICE_TICKET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                {['P1', 'P2', 'P3', 'P4'].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary resize-y"
            />
          </Field>

          <Field label="Scheduled visit (optional)">
            <input
              type="datetime-local"
              value={scheduledVisitAt}
              onChange={(e) => setScheduledVisitAt(e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={create.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {create.isPending && <Loader2 size={14} className="animate-spin" />}
            Create Ticket
          </button>
        </div>
      </div>
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
