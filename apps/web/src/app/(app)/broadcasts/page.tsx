'use client';

import { useState } from 'react';
import { Megaphone, Plus, Loader2, X, Send, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  useBroadcasts,
  usePreviewAudience,
  useCreateBroadcast,
  useStartBroadcast,
  useDeleteBroadcast,
  type BroadcastStatus,
  type AudienceFilter,
} from '@/hooks/use-broadcasts';

const STATUS_BADGE: Record<BroadcastStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  SENDING: 'bg-amber-100 text-amber-700',
  SENT: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

const LEAD_STAGES = ['NEW', 'QUALIFIED', 'FOLLOW_UP', 'CONVERTED', 'NOT_ANSWERED', 'INVALID', 'WRONG_ENQUIRY'];
const SOURCE_TYPES = ['META', 'INDIAMART', 'JUSTDIAL', 'WEBSITE', 'WHATSAPP', 'MANUAL', 'PHONE_INBOUND'];

export default function BroadcastsPage() {
  const { data: broadcasts = [], isLoading, isError } = useBroadcasts();
  const [showForm, setShowForm] = useState(false);
  const start = useStartBroadcast();
  const del = useDeleteBroadcast();

  async function handleStart(id: string, recipientLabel: string) {
    if (!window.confirm(`Send this broadcast to ${recipientLabel}? This cannot be undone.`)) return;
    try {
      await start.mutateAsync(id);
      toast.success('Broadcast started');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Failed to start broadcast');
    }
  }

  async function handleDelete(id: string) {
    try {
      await del.mutateAsync(id);
      toast.success('Draft deleted');
    } catch {
      toast.error('Failed to delete');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">WhatsApp Broadcasts</h1>
          <p className="text-sm text-slate-500 mt-1">
            Send a template message to a filtered segment of leads.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} /> New Broadcast
        </button>
      </div>

      {showForm && <CreateBroadcastModal onClose={() => setShowForm(false)} />}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-white rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-danger text-sm">Failed to load broadcasts. Please refresh.</p>
      ) : broadcasts.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-10 text-center">
          <Megaphone size={26} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No broadcasts yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {broadcasts.map((b) => {
            const processed = b.sentCount + b.failedCount;
            const pct = b.recipientCount > 0 ? Math.round((processed / b.recipientCount) * 100) : 0;
            return (
              <div key={b.id} className="bg-white rounded-xl border border-border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{b.name}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[b.status]}`}>
                        {b.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {b.templateName ? `Template: ${b.templateName}` : 'Text message'} ·{' '}
                      {new Date(b.createdAt).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {b.status === 'DRAFT' && (
                      <>
                        <button
                          onClick={() => void handleStart(b.id, 'the matched audience')}
                          disabled={start.isPending}
                          className="inline-flex items-center gap-1 text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          <Send size={12} /> Start
                        </button>
                        <button
                          onClick={() => void handleDelete(b.id)}
                          className="text-slate-400 hover:text-danger transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {b.status !== 'DRAFT' && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>
                        {b.sentCount} sent · {b.failedCount} failed · {b.recipientCount} total
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${b.status === 'SENDING' ? 'bg-amber-400' : 'bg-success'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateBroadcastModal({ onClose }: { onClose: () => void }) {
  const create = useCreateBroadcast();
  const preview = usePreviewAudience();

  const [name, setName] = useState('');
  const [mode, setMode] = useState<'template' | 'text'>('template');
  const [templateName, setTemplateName] = useState('');
  const [params, setParams] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [filter, setFilter] = useState<AudienceFilter>({});
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  function setF(key: keyof AudienceFilter, value: string) {
    setFilter((f) => {
      const next = { ...f };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    setPreviewCount(null);
  }

  async function runPreview() {
    try {
      const res = await preview.mutateAsync(filter);
      setPreviewCount(res.count);
    } catch {
      toast.error('Preview failed');
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (mode === 'template' && !templateName.trim()) {
      toast.error('Template name is required');
      return;
    }
    if (mode === 'text' && !bodyText.trim()) {
      toast.error('Message text is required');
      return;
    }

    const templateParams: Record<string, string> = {};
    if (mode === 'template' && params.trim()) {
      params.split(',').forEach((p, i) => {
        templateParams[String(i + 1)] = p.trim();
      });
    }

    try {
      await create.mutateAsync({
        name: name.trim(),
        audienceFilter: filter,
        ...(mode === 'template'
          ? { templateName: templateName.trim(), templateParams }
          : { bodyText: bodyText.trim() }),
      });
      toast.success('Broadcast draft created');
      onClose();
    } catch {
      toast.error('Failed to create broadcast');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-slate-900">New WhatsApp Broadcast</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Broadcast name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={160}
              placeholder="e.g. Diwali offer — Coimbatore"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>

          <div className="flex gap-2">
            {(['template', 'text'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${
                  mode === m
                    ? 'bg-primary text-white border-primary'
                    : 'text-slate-600 border-border hover:border-primary/50'
                }`}
              >
                {m === 'template' ? 'Template message' : 'Text message'}
              </button>
            ))}
          </div>

          {mode === 'template' ? (
            <>
              <Field label="Template name">
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="welcome_catalogue_v1"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>
              <Field label="Template parameters (comma-separated, in order)">
                <input
                  value={params}
                  onChange={(e) => setParams(e.target.value)}
                  placeholder="Value 1, Value 2"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>
            </>
          ) : (
            <Field label="Message text">
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={3}
                maxLength={2000}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary resize-y"
              />
              <p className="text-[11px] text-amber-600 mt-1">
                Free-form text only delivers to leads with an open 24h WhatsApp session.
              </p>
            </Field>
          )}

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-slate-600 mb-2">Audience filter</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stage">
                <select
                  value={filter.stage ?? ''}
                  onChange={(e) => setF('stage', e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="">Any stage</option>
                  {LEAD_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Source">
                <select
                  value={filter.sourceType ?? ''}
                  onChange={(e) => setF('sourceType', e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="">Any source</option>
                  {SOURCE_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="City">
                <input
                  value={filter.city ?? ''}
                  onChange={(e) => setF('city', e.target.value)}
                  placeholder="Any city"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>
              <Field label="Tag">
                <input
                  value={filter.tag ?? ''}
                  onChange={(e) => setF('tag', e.target.value)}
                  placeholder="Any tag"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={() => void runPreview()}
                disabled={preview.isPending}
                className="inline-flex items-center gap-1.5 text-xs border border-border px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {preview.isPending ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
                Preview audience
              </button>
              {previewCount !== null && (
                <span className="text-sm font-medium text-slate-700">
                  {previewCount.toLocaleString('en-IN')} recipient{previewCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
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
            Save as Draft
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
