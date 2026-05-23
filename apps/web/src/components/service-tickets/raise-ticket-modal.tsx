'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { toast } from 'sonner';
import {
  useCreateServiceTicket,
  SERVICE_TICKET_TYPES,
  TYPE_LABEL,
  type ServiceTicketType,
} from '@/hooks/use-service-tickets';
import { useProjects } from '@/hooks/use-projects';
import { getApiErrorMessage } from '@/lib/api-error';

const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;

const PRIORITY_HINT: Record<string, string> = {
  P1: 'System down — 24h resolve',
  P2: 'Major issue — 48h resolve',
  P3: 'Minor issue — 5 day resolve',
  P4: 'Low urgency — 10 day resolve',
};

export function RaiseTicketModal({
  onClose,
  defaultProjectId,
}: {
  onClose: () => void;
  defaultProjectId?: string;
}) {
  const modalRef = useFocusTrap(onClose);
  const { data: projectData } = useProjects();
  const projects = projectData?.projects ?? [];
  const create   = useCreateServiceTicket();

  const [projectId, setProjectId]       = useState(defaultProjectId ?? '');
  const [type, setType]                 = useState<ServiceTicketType>('COMPLAINT');
  const [subject, setSubject]           = useState('');
  const [description, setDescription]   = useState('');
  const [priority, setPriority]         = useState('P3');
  const [scheduledVisitAt, setVisitAt]  = useState('');

  const selectedProject = projects.find((p) => p.id === projectId);

  async function handleSave() {
    if (!selectedProject) { toast.error('Select a project'); return; }
    if (!subject.trim() || !description.trim()) { toast.error('Subject and description are required'); return; }
    try {
      await create.mutateAsync({
        leadId:    selectedProject.lead.id,
        projectId: selectedProject.id,
        type,
        subject:   subject.trim(),
        description: description.trim(),
        priority,
        ...(scheduledVisitAt && { scheduledVisitAt: new Date(scheduledVisitAt).toISOString() }),
      });
      toast.success('Service ticket created');
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to create ticket'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="New Service Ticket"
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-slate-900">New Service Ticket</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Project */}
          {!defaultProjectId && (
            <Field label="Project / Customer">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.number} — {p.lead.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {defaultProjectId && selectedProject && (
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {selectedProject.number} — {selectedProject.lead.name}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ServiceTicketType)}
                className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {SERVICE_TICKET_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>
            </Field>
            <Field label={`Priority — ${PRIORITY_HINT[priority] ?? ''}`}>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Brief description of the issue"
              className="w-full text-sm border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="Full details — symptoms, error codes, customer complaint…"
              className="w-full text-sm border border-border rounded-xl px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>

          <Field label="Schedule visit (optional)">
            <input
              type="datetime-local"
              value={scheduledVisitAt}
              onChange={(e) => setVisitAt(e.target.value)}
              className="w-full text-sm border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
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
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
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
