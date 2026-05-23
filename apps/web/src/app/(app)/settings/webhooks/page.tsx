'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Webhook, Plus, Trash2, RotateCcw, CheckCircle, XCircle, X, ChevronDown, ChevronRight, Eye, EyeOff, ToggleLeft, ToggleRight } from 'lucide-react';
import { api } from '@/lib/api';
import { format } from 'date-fns';

const SUPPORTED_EVENTS = [
  { key: 'lead.created', label: 'Lead Created', desc: 'Fires when a new lead is captured from any source' },
  { key: 'lead.stage_changed', label: 'Lead Stage Changed', desc: 'Fires when a lead moves to a new pipeline stage' },
  { key: 'lead.assigned', label: 'Lead Assigned', desc: 'Fires when a lead is assigned to a team member' },
  { key: 'appointment.created', label: 'Appointment Created', desc: 'Fires when a site survey is booked' },
  { key: 'ticket.created', label: 'Service Ticket Created', desc: 'Fires when a new service ticket is raised' },
  { key: 'commission.approved', label: 'Commission Approved', desc: 'Fires when a franchise commission is approved' },
];

interface Delivery {
  id: string;
  event: string;
  success: boolean;
  statusCode: number | null;
  responseMs: number | null;
  attemptedAt: string;
}

interface Endpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  isActive: boolean;
  createdAt: string;
  deliveries: Delivery[];
}

function useWebhooks() {
  return useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.get<{ data: { endpoints: Endpoint[] } }>('/settings/webhooks').then((r) => r.data.data),
  });
}

function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { url: string; description?: string; events: string[] }) =>
      api.post<{ data: Endpoint & { secret: string } }>('/settings/webhooks', data).then((r) => r.data.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}

function useToggleWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/settings/webhooks/${id}`, { isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}

function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/settings/webhooks/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}

function useRotateSecret() {
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ data: { secret: string } }>(`/settings/webhooks/${id}/rotate-secret`).then((r) => r.data.data.secret),
  });
}

function AddWebhookModal({ onClose, onCreated }: { onClose: () => void; onCreated: (secret: string) => void }) {
  const [url, setUrl] = useState('');
  const [desc, setDesc] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const create = useCreateWebhook();

  function toggleEvent(key: string) {
    setEvents((p) => p.includes(key) ? p.filter((e) => e !== key) : [...p, key]);
  }

  async function submit() {
    if (!url.trim() || events.length === 0) return;
    try {
      const payload: { url: string; events: string[]; description?: string } = { url: url.trim(), events };
      if (desc.trim()) payload.description = desc.trim();
      const ep = await create.mutateAsync(payload);
      toast.success('Webhook endpoint created');
      onCreated(ep.secret);
    } catch {
      toast.error('Failed to create webhook');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl border border-border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-slate-800">Add Webhook Endpoint</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Endpoint URL *</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.zapier.com/hooks/catch/..."
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description (optional)</label>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. Zapier → Google Sheets"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Events to subscribe *</label>
            <div className="space-y-2">
              {SUPPORTED_EVENTS.map((ev) => (
                <label key={ev.key} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={events.includes(ev.key)}
                    onChange={() => toggleEvent(ev.key)}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-700 group-hover:text-primary">{ev.label}</p>
                    <p className="text-xs text-slate-400">{ev.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => void submit()}
              disabled={!url.trim() || events.length === 0 || create.isPending}
              className="flex-1 py-2 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              Create Endpoint
            </button>
            <button onClick={onClose} className="flex-1 py-2 border border-border rounded-lg text-sm text-slate-600">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SecretRevealModal({ secret, onClose }: { secret: string; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl border border-border shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-slate-800">Webhook Secret</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            Save this secret now — it will not be shown again. Use it to verify the <code>X-Excess-Signature</code> header on incoming webhook requests.
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-slate-100 px-3 py-2 rounded-lg font-mono break-all">
              {visible ? secret : '••••••••••••••••••••••••••••••••'}
            </code>
            <button onClick={() => setVisible((v) => !v)} className="p-2 text-slate-400 hover:text-slate-700">
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button
            onClick={() => { void navigator.clipboard.writeText(secret); toast.success('Secret copied'); }}
            className="w-full py-2 bg-primary text-white text-sm font-semibold rounded-lg"
          >
            Copy Secret
          </button>
        </div>
      </div>
    </div>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useToggleWebhook();
  const del = useDeleteWebhook();
  const rotate = useRotateSecret();
  const [revealSecret, setRevealSecret] = useState<string | null>(null);

  const recentSuccess = ep.deliveries.filter((d) => d.success).length;
  const recentTotal = ep.deliveries.length;

  return (
    <>
      {revealSecret && <SecretRevealModal secret={revealSecret} onClose={() => setRevealSecret(null)} />}
      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <div className="flex items-start gap-4 p-5">
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ep.isActive ? 'bg-primary/10' : 'bg-slate-100'}`}>
            <Webhook size={16} className={ep.isActive ? 'text-primary' : 'text-slate-400'} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{ep.url}</p>
                {ep.description && <p className="text-xs text-slate-500 mt-0.5">{ep.description}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggle.mutate({ id: ep.id, isActive: !ep.isActive })}
                  className="text-slate-400 hover:text-primary transition-colors"
                  title={ep.isActive ? 'Disable' : 'Enable'}
                >
                  {ep.isActive ? <ToggleRight size={22} className="text-primary" /> : <ToggleLeft size={22} />}
                </button>
                <button
                  onClick={() => {
                    rotate.mutate(ep.id, {
                      onSuccess: (secret) => setRevealSecret(secret),
                      onError: () => toast.error('Failed to rotate secret'),
                    });
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors"
                  title="Rotate secret"
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  onClick={() => {
                    del.mutate(ep.id, {
                      onSuccess: () => toast.success('Endpoint deleted'),
                      onError: () => toast.error('Failed to delete'),
                    });
                  }}
                  className="p-1.5 text-slate-400 hover:text-danger transition-colors"
                  title="Delete endpoint"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {ep.events.map((ev) => (
                <span key={ev} className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {ev}
                </span>
              ))}
            </div>

            {ep.deliveries.length > 0 && (
              <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <CheckCircle size={12} className="text-success" />
                  {recentSuccess}/{recentTotal} recent
                </span>
                <span>Last: {format(new Date(ep.deliveries[0]!.attemptedAt), 'MMM d, HH:mm')}</span>
                <button onClick={() => setExpanded((v) => !v)} className="text-primary hover:underline flex items-center gap-0.5">
                  Deliveries {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
              </div>
            )}
          </div>
        </div>

        {expanded && ep.deliveries.length > 0 && (
          <div className="border-t border-border divide-y divide-border">
            {ep.deliveries.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-5 py-2.5 text-xs">
                {d.success
                  ? <CheckCircle size={13} className="text-success shrink-0" />
                  : <XCircle size={13} className="text-danger shrink-0" />}
                <span className="font-medium text-slate-700 w-40 truncate">{d.event}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${d.success ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                  {d.statusCode ?? 'ERR'}
                </span>
                <span className="text-slate-400">{d.responseMs != null ? `${d.responseMs}ms` : '—'}</span>
                <span className="text-slate-400 ml-auto">{format(new Date(d.attemptedAt), 'MMM d, HH:mm')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function WebhooksSettingsPage() {
  const { data, isLoading } = useWebhooks();
  const [addOpen, setAddOpen] = useState(false);
  const [revealSecret, setRevealSecret] = useState<string | null>(null);

  const endpoints = data?.endpoints ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Webhook size={20} className="text-primary" /> Outbound Webhooks
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Send real-time events to any URL — connect Zapier, Make, or your own systems.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors shrink-0"
        >
          <Plus size={16} /> Add Endpoint
        </button>
      </div>

      <div className="rounded-xl border border-border bg-white p-4 text-xs text-slate-600 space-y-1.5">
        <p className="font-semibold text-slate-700">How it works</p>
        <p>Every event sends a signed <code className="bg-slate-100 px-1 rounded">POST</code> request with a <code className="bg-slate-100 px-1 rounded">X-Excess-Signature</code> header (HMAC-SHA256 using your endpoint secret). Verify this on your end to ensure authenticity.</p>
      </div>

      {addOpen && (
        <AddWebhookModal
          onClose={() => setAddOpen(false)}
          onCreated={(secret) => { setAddOpen(false); setRevealSecret(secret); }}
        />
      )}

      {revealSecret && <SecretRevealModal secret={revealSecret} onClose={() => setRevealSecret(null)} />}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-white" />)}
        </div>
      ) : endpoints.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-white p-12 text-center">
          <Webhook size={36} className="mx-auto mb-3 text-slate-200" />
          <p className="text-sm font-medium text-slate-500">No webhook endpoints yet</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">Add one to start streaming events to Zapier, Make, or your own system</p>
          <button
            onClick={() => setAddOpen(true)}
            className="text-sm text-primary font-medium hover:underline"
          >
            + Add your first endpoint
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {endpoints.map((ep) => <EndpointCard key={ep.id} ep={ep} />)}
        </div>
      )}
    </div>
  );
}
