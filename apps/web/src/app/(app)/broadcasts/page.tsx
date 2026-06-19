'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Megaphone, Plus, Loader2, X, Send, Trash2, Users, BarChart2, Sparkles, Clock, GitMerge, Zap, Wand2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  useBroadcasts,
  usePreviewAudience,
  useCreateBroadcast,
  useStartBroadcast,
  useDeleteBroadcast,
  useBroadcastTemplates,
  useBroadcastEnrollSequence,
  useAudiencePresets,
  useReEngagementLaunch,
  useGenerateMessage,
  type BroadcastStatus,
  type AudienceFilter,
  type BroadcastTemplate,
} from '@/hooks/use-broadcasts';
import { useSequences } from '@/hooks/use-sequences';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { getApiErrorMessage } from '@/lib/api-error';

const STATUS_BADGE: Record<BroadcastStatus, string> = {
  DRAFT:     'bg-slate-100 text-slate-600',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  SENDING:   'bg-amber-100 text-amber-700',
  SENT:      'bg-green-100 text-green-700',
  FAILED:    'bg-red-100 text-red-700',
};

const LEAD_STAGES    = ['NEW', 'QUALIFIED', 'FOLLOW_UP', 'CONVERTED', 'NOT_ANSWERED', 'INVALID', 'WRONG_ENQUIRY'];
const SOURCE_TYPES   = ['META', 'INDIAMART', 'JUSTDIAL', 'WEBSITE', 'WHATSAPP', 'MANUAL', 'PHONE_INBOUND'];
const AMC_WINDOWS    = [{ value: 'expiring30', label: 'AMC expiring in 30 days' }, { value: 'expiring60', label: 'AMC expiring in 60 days' }, { value: 'expired', label: 'AMC expired' }];
const SUBSIDY_STATUS = ['NOT_APPLIED', 'APPLIED', 'DISCOM_INSPECTION_SCHEDULED', 'DISCOM_APPROVED', 'PORTAL_UPLOAD_DONE', 'CREDITED'];
const PROJECT_STAGES = ['SURVEY', 'DESIGN', 'MATERIAL_ORDERED', 'INSTALLATION', 'COMMISSIONING', 'HANDED_OVER'];

export default function BroadcastsPage() {
  const { data: broadcasts = [], isLoading, isError } = useBroadcasts();
  const { data: sequences = [] } = useSequences();
  const [showForm, setShowForm]     = useState(false);
  const [enrollTarget, setEnroll]   = useState<string | null>(null);
  const [enrollSeqId, setEnrollSeq] = useState('');
  const start       = useStartBroadcast();
  const del         = useDeleteBroadcast();
  const enrollSeq   = useBroadcastEnrollSequence();

  async function handleStart(id: string) {
    if (!window.confirm('Send this broadcast to the matched audience? This cannot be undone.')) return;
    try {
      await start.mutateAsync(id);
      toast.success('Broadcast started');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to start broadcast'));
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

  async function handleEnrollSequence() {
    if (!enrollTarget || !enrollSeqId) return;
    try {
      const res = await enrollSeq.mutateAsync({ broadcastId: enrollTarget, sequenceId: enrollSeqId });
      toast.success(`${res.enrolled} lead${res.enrolled === 1 ? '' : 's'} enrolled in sequence`);
      setEnroll(null);
      setEnrollSeq('');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Enrolment failed'));
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
        <div className="flex items-center gap-2">
          <Link
            href="/broadcasts/analytics"
            className="inline-flex items-center gap-1.5 text-sm border border-border px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <BarChart2 size={14} /> Analytics
          </Link>
          <Link
            href="/broadcasts/optouts"
            className="inline-flex items-center gap-1.5 text-sm border border-border px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Users size={14} /> Opt-outs
          </Link>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} /> New Broadcast
          </button>
        </div>
      </div>

      {showForm && <CreateBroadcastModal onClose={() => setShowForm(false)} />}

      {/* Audience Presets */}
      <AudiencePresetsPanel />

      {/* Enroll-in-sequence modal */}
      {enrollTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Follow up with sequence</h2>
            <p className="text-sm text-slate-500">All SENT recipients of this broadcast will be enrolled in the selected drip sequence.</p>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Sequence</label>
              <select
                value={enrollSeqId}
                onChange={(e) => setEnrollSeq(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Choose a sequence…</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setEnroll(null); setEnrollSeq(''); }} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
              <button
                onClick={() => void handleEnrollSequence()}
                disabled={!enrollSeqId || enrollSeq.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {enrollSeq.isPending && <Loader2 size={14} className="animate-spin" />}
                Enroll
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-white rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-danger text-sm">Failed to load broadcasts. Please refresh.</p>
      ) : broadcasts.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 sm:p-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Megaphone size={28} className="text-slate-400" />
          </div>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">No broadcasts yet</h3>
          <p className="text-xs text-slate-400 mb-5 max-w-xs mx-auto">
            Send a WhatsApp message to a filtered segment of leads in one click.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            <span className="text-base">+</span>
            New Broadcast
          </button>
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
                      {b.scheduledAt && (
                        <span className="ml-2 inline-flex items-center gap-1 text-blue-600">
                          <Clock size={10} /> Scheduled {format(new Date(b.scheduledAt), 'd MMM yyyy, h:mm a')}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {b.status === 'DRAFT' && (
                      <>
                        <button
                          onClick={() => void handleStart(b.id)}
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
                    {b.status === 'SENT' && sequences.length > 0 && (
                      <button
                        onClick={() => { setEnroll(b.id); setEnrollSeq(''); }}
                        className="inline-flex items-center gap-1 text-xs border border-primary/30 bg-primary/5 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/10 transition-colors"
                      >
                        <GitMerge size={12} /> Follow up
                      </button>
                    )}
                  </div>
                </div>

                {b.status !== 'DRAFT' && b.status !== 'SCHEDULED' && (
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

function AudiencePresetsPanel() {
  const { data: presets = [], isLoading } = useAudiencePresets();
  const launch = useReEngagementLaunch();

  async function handleLaunch(daysInactive: number, template: string) {
    try {
      const res = await launch.mutateAsync({ daysInactive, messageTemplate: template });
      toast.success(`Draft created — ${res.audienceSize} recipients. Review and start it below.`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to create broadcast'));
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-xl border border-border animate-pulse" />)}
      </div>
    );
  }

  if (presets.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-1.5">
        <Zap size={14} className="text-accent" /> Quick Launch Campaigns
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {presets.map((p) => (
          <div key={p.id} className="bg-white rounded-xl border border-border p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xl">{p.icon}</span>
              <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {p.audienceSize.toLocaleString('en-IN')}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 leading-tight">{p.name}</p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{p.description}</p>
            </div>
            <button
              onClick={() => void handleLaunch(p.daysInactive || 7, p.suggestedTemplate)}
              disabled={launch.isPending || p.audienceSize === 0}
              className="mt-auto inline-flex items-center justify-center gap-1 text-xs bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              {launch.isPending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              Quick Launch
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateBroadcastModal({ onClose }: { onClose: () => void }) {
  const modalRef = useFocusTrap(onClose);
  const create      = useCreateBroadcast();
  const preview     = usePreviewAudience();
  const generateMsg = useGenerateMessage();
  const { data: templates = [] } = useBroadcastTemplates();

  const [name, setName]             = useState('');
  const [mode, setMode]             = useState<'template' | 'text'>('template');
  const [templateName, setTplName]  = useState('');
  const [params, setParams]         = useState('');
  const [bodyText, setBodyText]     = useState('');
  const [aiGenerated, setAiGenerated] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiGoal, setAiGoal]           = useState('re_engage');
  const [aiLang, setAiLang]           = useState('mixed');
  const [scheduledAt, setScheduled] = useState('');
  const [filter, setFilter]         = useState<AudienceFilter>({});
  const [previewCount, setPreview]  = useState<number | null>(null);
  const [showTpl, setShowTpl] = useState(false);

  async function handleGenerateMessage() {
    try {
      const res = await generateMsg.mutateAsync({ goal: aiGoal, language: aiLang });
      setBodyText(res.message);
      setAiGenerated(res.generated);
      setShowAiPanel(false);
      if (mode !== 'text') setMode('text');
      toast.success(res.generated ? 'Message generated with AI ✨' : 'Using template message');
    } catch {
      toast.error('Failed to generate message');
    }
  }

  function setF(key: keyof AudienceFilter, value: string) {
    setFilter((f) => {
      const next = { ...f };
      if (value) (next as Record<string, string>)[key] = value;
      else delete next[key];
      return next;
    });
    setPreview(null);
  }

  function applyTemplate(tpl: BroadcastTemplate) {
    setName(tpl.name);
    setTplName(tpl.templateName);
    setMode('template');
    setFilter(tpl.defaultAudienceFilter as AudienceFilter);
    setPreview(null);
    setShowTpl(false);
  }

  async function runPreview() {
    try {
      const res = await preview.mutateAsync(filter);
      setPreview(res.count);
    } catch {
      toast.error('Preview failed');
    }
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (mode === 'template' && !templateName.trim()) { toast.error('Template name is required'); return; }
    if (mode === 'text' && !bodyText.trim()) { toast.error('Message text is required'); return; }

    const templateParams: Record<string, string> = {};
    if (mode === 'template' && params.trim()) {
      params.split(',').forEach((p, i) => { templateParams[String(i + 1)] = p.trim(); });
    }

    try {
      await create.mutateAsync({
        name: name.trim(),
        audienceFilter: filter,
        ...(mode === 'template'
          ? { templateName: templateName.trim(), templateParams }
          : { bodyText: bodyText.trim() }),
        ...(scheduledAt && { scheduledAt: new Date(scheduledAt).toISOString() }),
      });
      toast.success(scheduledAt ? 'Broadcast scheduled' : 'Broadcast draft created');
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to create broadcast'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="New WhatsApp Broadcast"
        className="bg-white rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-slate-900">New WhatsApp Broadcast</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Template library quick-select */}
          <div>
            <button
              onClick={() => setShowTpl((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-primary border border-primary/30 bg-primary/5 px-3 py-1.5 rounded-lg hover:bg-primary/10 transition-colors"
            >
              <Sparkles size={12} /> {showTpl ? 'Hide' : 'Use a solar template'}
            </button>
            {showTpl && templates.length > 0 && (
              <div className="mt-2 grid grid-cols-1 gap-2">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl)}
                    className="text-left rounded-xl border border-border px-3 py-2.5 hover:border-primary/40 hover:bg-slate-50 transition-colors"
                  >
                    <div className="text-sm font-medium text-slate-800">{tpl.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{tpl.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

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
                  onChange={(e) => setTplName(e.target.value)}
                  placeholder="amc_renewal_reminder"
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
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-500">
                  Message text
                  {aiGenerated && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">
                      <Sparkles size={9} /> AI-generated
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setShowAiPanel((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] text-violet-600 border border-violet-200 bg-violet-50 px-2 py-1 rounded-lg hover:bg-violet-100 transition-colors"
                >
                  <Wand2 size={11} /> Generate with AI
                </button>
              </div>
              {showAiPanel && (
                <div className="mb-2 border border-violet-200 bg-violet-50 rounded-xl p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Goal</label>
                      <select
                        value={aiGoal}
                        onChange={(e) => setAiGoal(e.target.value)}
                        className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="re_engage">Re-engage cold lead</option>
                        <option value="subsidy_info">Subsidy information</option>
                        <option value="followup_nudge">Follow-up nudge</option>
                        <option value="amc_renewal">AMC renewal</option>
                        <option value="referral_ask">Referral ask</option>
                        <option value="festival_offer">Festival offer</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Language</label>
                      <select
                        value={aiLang}
                        onChange={(e) => setAiLang(e.target.value)}
                        className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="mixed">Tanglish (Mixed)</option>
                        <option value="tamil">Tamil</option>
                        <option value="english">English</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleGenerateMessage()}
                    disabled={generateMsg.isPending}
                    className="inline-flex items-center gap-1 text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
                  >
                    {generateMsg.isPending ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    Generate
                  </button>
                </div>
              )}
              <textarea
                value={bodyText}
                onChange={(e) => { setBodyText(e.target.value); setAiGenerated(false); }}
                rows={3}
                maxLength={2000}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary resize-y"
              />
              <p className="text-[11px] text-amber-600 mt-1">
                Free-form text only delivers to leads with an open 24h WhatsApp session.
              </p>
            </div>
          )}

          {/* Scheduled send */}
          <Field label="Schedule send (optional — leave blank to save as draft)">
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduled(e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>

          {/* Audience filter */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-slate-600 mb-3">Audience filter</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stage">
                <select
                  value={filter.stage ?? ''}
                  onChange={(e) => setF('stage', e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="">Any stage</option>
                  {LEAD_STAGES.map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
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
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
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

            {/* Solar-specific filters */}
            <p className="text-[11px] font-semibold text-slate-500 mt-3 mb-2 uppercase tracking-wide">Solar segments</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="AMC window">
                <select
                  value={filter.amcWindow ?? ''}
                  onChange={(e) => setF('amcWindow', e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="">Any</option>
                  {AMC_WINDOWS.map((w) => (
                    <option key={w.value} value={w.value}>{w.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Project stage">
                <select
                  value={filter.projectStage ?? ''}
                  onChange={(e) => setF('projectStage', e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="">Any</option>
                  {PROJECT_STAGES.map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </Field>
              <Field label="Subsidy status">
                <select
                  value={filter.subsidyStatus ?? ''}
                  onChange={(e) => setF('subsidyStatus', e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="">Any</option>
                  {SUBSIDY_STATUS.map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
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
            {scheduledAt ? 'Schedule Broadcast' : 'Save as Draft'}
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
