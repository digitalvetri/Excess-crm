'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow, format, differenceInHours } from 'date-fns';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Clock,
  Edit2,
  Check,
  FileText,
  PhoneCall,
  MessageSquare,
  UserCheck,
  RefreshCw,
  CalendarCheck,
  AlertCircle,
  Star,
  X,
  Sparkles,
  Tag,
  ChevronDown,
  ChevronUp,
  Plus,
  Loader2,
  Copy,
  GitMerge,
  Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLeadDetail, useUpdateLead, useUpdateLeadTags, useLeadSummary, useMergeLeads } from '@/hooks/use-leads';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StageBadge } from './stage-badge';
import { AppointmentsList } from '@/components/appointments/appointments-list';
import { AssignLeadPanel } from './assign-lead-panel';

const STAGES = [
  'NEW',
  'QUALIFIED',
  'FOLLOW_UP',
  'CONVERTED',
  'NOT_ANSWERED',
  'INVALID',
  'WRONG_ENQUIRY',
];

const SOURCE_LABELS: Record<string, string> = {
  META: 'Meta Lead Ads',
  INDIAMART: 'IndiaMART',
  JUSTDIAL: 'JustDial',
  WEBSITE: 'Website',
  WHATSAPP: 'WhatsApp',
  MANUAL: 'Manual',
  PHONE_INBOUND: 'Missed Call',
};

const ACTIVITY_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  NOTE: { icon: FileText, color: 'text-slate-500 bg-slate-100', label: 'Note' },
  STAGE_CHANGE: { icon: RefreshCw, color: 'text-primary bg-primary/10', label: 'Stage change' },
  ASSIGNMENT: { icon: UserCheck, color: 'text-indigo-600 bg-indigo-50', label: 'Assignment' },
  CALL: { icon: PhoneCall, color: 'text-green-600 bg-green-50', label: 'Call' },
  WHATSAPP: { icon: MessageSquare, color: 'text-emerald-600 bg-emerald-50', label: 'WhatsApp' },
  QUOTATION_SENT: { icon: FileText, color: 'text-amber-600 bg-amber-50', label: 'Quotation sent' },
  APPOINTMENT_BOOKED: { icon: CalendarCheck, color: 'text-blue-600 bg-blue-50', label: 'Appointment' },
  EMAIL: { icon: Mail, color: 'text-violet-600 bg-violet-50', label: 'Email' },
};

function SlaBanner({ stage, stageChangedAt }: { stage: string; stageChangedAt: string }) {
  const hours = differenceInHours(new Date(), new Date(stageChangedAt));
  if (hours < 24 || stage === 'CONVERTED' || stage === 'INVALID' || stage === 'WRONG_ENQUIRY') return null;

  const urgent = hours > 72;
  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${
      urgent ? 'bg-red-50 text-danger border border-red-100' : 'bg-amber-50 text-warning border border-amber-100'
    }`}>
      <AlertCircle size={15} />
      <span className="font-medium">
        {urgent
          ? `No activity in ${Math.floor(hours / 24)} days — this lead needs attention`
          : `${hours}h in ${stage.replace('_', ' ')} stage`}
      </span>
    </div>
  );
}

function ScoreWithBreakdown({ score, breakdown }: { score: number | null; breakdown: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);
  if (score === null) return <span className="text-xs text-slate-400">—</span>;
  const color = score >= 80 ? 'bg-green-100 text-green-700 border-green-200' : score >= 50 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200';
  const factors = breakdown ? Object.entries(breakdown) : [];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${color}`}
        title={factors.length ? 'Click to see score breakdown' : undefined}
      >
        <Star size={11} /> {score} {factors.length ? (open ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : null}
      </button>
      {open && factors.length > 0 && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-border rounded-xl shadow-lg p-3 w-56 text-xs space-y-1.5">
          <p className="font-semibold text-slate-700 mb-2">Score Breakdown</p>
          {factors.map(([key, val]) => (
            <div key={key} className="flex justify-between">
              <span className="text-slate-500 capitalize">{key.replace(/_/g, ' ')}</span>
              <span className="font-medium text-slate-700">{String(val)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PRESET_TAGS = ['Hot', 'Warm', 'Cold', 'High Value', 'Follow Up Soon', 'DND', 'Language Barrier'];

function LeadTagsCard({ leadId, tags }: { leadId: string; tags: string[] }) {
  const [editing, setEditing] = useState(false);
  const [localTags, setLocalTags] = useState<string[]>(tags);
  const [input, setInput] = useState('');
  const { mutateAsync: updateTags, isPending } = useUpdateLeadTags();

  async function save() {
    try {
      await updateTags({ id: leadId, tags: localTags });
      setEditing(false);
      toast.success('Tags saved');
    } catch {
      toast.error('Failed to save tags');
    }
  }

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || localTags.includes(trimmed)) return;
    setLocalTags((prev) => [...prev, trimmed]);
    setInput('');
  }

  function removeTag(tag: string) {
    setLocalTags((prev) => prev.filter((t) => t !== tag));
  }

  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <Tag size={14} className="text-slate-400" /> Tags
        </h3>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={isPending}
              className="text-xs text-white bg-primary px-2 py-0.5 rounded-md disabled:opacity-50 flex items-center gap-1"
            >
              {isPending && <Loader2 size={10} className="animate-spin" />} Save
            </button>
            <button onClick={() => { setEditing(false); setLocalTags(tags); }} className="text-xs text-slate-500">
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {localTags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            {tag}
            {editing && (
              <button onClick={() => removeTag(tag)} className="hover:text-danger"><X size={10} /></button>
            )}
          </span>
        ))}
        {localTags.length === 0 && !editing && (
          <span className="text-xs text-slate-400 italic">No tags</span>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_TAGS.filter((t) => !localTags.includes(t)).map((t) => (
              <button
                key={t}
                onClick={() => addTag(t)}
                className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-0.5"
              >
                <Plus size={9} /> {t}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { addTag(input); } }}
              placeholder="Custom tag..."
              className="flex-1 text-xs border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={() => addTag(input)}
              className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LeadSummaryCard({ leadId }: { leadId: string }) {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading, isError } = useLeadSummary(enabled ? leadId : null);

  return (
    <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/20 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-1.5">
          <Sparkles size={14} /> AI Summary
        </h3>
        {!enabled && (
          <button
            onClick={() => setEnabled(true)}
            className="text-xs bg-primary text-white px-3 py-1 rounded-lg hover:bg-primary/90 transition-colors"
          >
            Generate
          </button>
        )}
      </div>

      {!enabled && (
        <p className="text-xs text-slate-500">Click Generate to get an AI-powered summary of this lead&apos;s intent and recommended next action.</p>
      )}

      {enabled && isLoading && (
        <div className="flex items-center gap-2 py-2">
          <Loader2 size={14} className="animate-spin text-primary" />
          <span className="text-xs text-primary/70">Analysing lead...</span>
        </div>
      )}

      {enabled && isError && (
        <p className="text-xs text-danger">Failed to generate summary. Please try again.</p>
      )}

      {enabled && data && (
        <div className="space-y-1">
          <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{data.summary}</div>
          <p className="text-[10px] text-slate-400 mt-2">
            Generated {new Date(data.generatedAt).toLocaleTimeString()} · Cached 1h
          </p>
        </div>
      )}
    </div>
  );
}

interface DuplicateLead {
  id: string;
  name: string;
  phone: string;
  stage: string;
  createdAt: string;
}

function DuplicatesCard({ masterId }: { masterId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['leads', masterId, 'duplicates'],
    queryFn: () =>
      api.get<{ data: DuplicateLead[] }>(`/leads/${masterId}/duplicates`).then((r) => r.data.data),
  });
  const { mutateAsync: mergeLeads, isPending } = useMergeLeads();
  const [merging, setMerging] = useState<string | null>(null);

  const dupes = data ?? [];

  if (isLoading) return (
    <div className="bg-white rounded-xl border border-border p-5 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-32 mb-3" />
      <div className="h-12 bg-slate-100 rounded" />
    </div>
  );

  if (dupes.length === 0) return null;

  async function handleMerge(duplicateId: string) {
    setMerging(duplicateId);
    try {
      await mergeLeads({ masterId, duplicateId });
      toast.success('Leads merged — duplicate marked as invalid');
    } catch {
      toast.error('Failed to merge leads');
    } finally {
      setMerging(null);
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Copy size={15} className="text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">
          {dupes.length} Duplicate{dupes.length !== 1 ? 's' : ''} Found
        </h3>
        <span className="text-xs text-amber-600 ml-auto">Same phone number</span>
      </div>
      <div className="space-y-2">
        {dupes.map((d) => (
          <div key={d.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-amber-100">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{d.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {d.stage.replace(/_/g, ' ')} · {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-3 shrink-0">
              <Link href={`/leads/${d.id}`} className="text-xs text-primary hover:underline">
                View
              </Link>
              <button
                onClick={() => void handleMerge(d.id)}
                disabled={isPending && merging === d.id}
                className="flex items-center gap-1 text-xs bg-amber-600 text-white px-2.5 py-1 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {isPending && merging === d.id
                  ? <Loader2 size={11} className="animate-spin" />
                  : <GitMerge size={11} />}
                Merge
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-amber-600 mt-3">
        Merging keeps this lead's history and marks the duplicate as invalid.
      </p>
    </div>
  );
}

function UtmCard({ lead }: { lead: { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null } }) {
  const params = [
    { label: 'Source', value: lead.utmSource },
    { label: 'Medium', value: lead.utmMedium },
    { label: 'Campaign', value: lead.utmCampaign },
    { label: 'Content', value: lead.utmContent },
    { label: 'Term', value: lead.utmTerm },
  ].filter((p) => p.value);

  if (params.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-3">
        <Link2 size={14} className="text-slate-400" /> UTM Attribution
      </h3>
      <dl className="space-y-2">
        {params.map(({ label, value }) => (
          <div key={label} className="flex justify-between items-center text-sm">
            <dt className="text-slate-400">utm_{label.toLowerCase()}</dt>
            <dd className="text-slate-700 font-medium text-right max-w-[60%] truncate" title={value!}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

interface LeadDetailViewProps {
  id: string;
}

export function LeadDetailView({ id }: LeadDetailViewProps) {
  const { data: lead, isLoading, isError } = useLeadDetail(id);
  const { mutate: updateLead, isPending } = useUpdateLead();
  const [editingStage, setEditingStage] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 bg-slate-200 rounded animate-pulse" />
        <div className="h-64 bg-white rounded-xl animate-pulse" />
        <div className="h-48 bg-white rounded-xl animate-pulse" />
      </div>
    );
  }

  if (isError || !lead) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 text-center">
        <p className="text-danger">Lead not found.</p>
        <Link href="/leads" className="text-sm text-primary hover:underline mt-2 inline-block">← Back to leads</Link>
      </div>
    );
  }

  function changeStage(stage: string) {
    updateLead(
      { id, data: { stage } },
      {
        onSuccess: () => {
          toast.success(`Stage → ${stage.replace('_', ' ')}`);
          setEditingStage(false);
        },
        onError: () => toast.error('Failed to update stage'),
      },
    );
  }

  function addNote() {
    if (!noteText.trim()) return;
    updateLead(
      { id, data: { notes: noteText } },
      {
        onSuccess: () => {
          toast.success('Note added');
          setNoteText('');
          setAddingNote(false);
        },
        onError: () => toast.error('Failed to add note'),
      },
    );
  }

  const activities =
    (lead as unknown as {
      activities?: { id: string; type: string; payload: Record<string, unknown>; createdAt: string; actorIsAi?: boolean }[];
    }).activities ?? [];
  const calls =
    (lead as unknown as {
      calls?: { id: string; status: string; persona: string; direction: string; durationSec: number | null; initiatedAt: string; connectedAt?: string | null }[];
    }).calls ?? [];

  function renderActivityText(act: { type: string; payload: Record<string, unknown> }) {
    const p = act.payload;
    switch (act.type) {
      case 'NOTE':
        return String(p['note'] ?? '');
      case 'STAGE_CHANGE':
        return `Stage changed to ${String(p['newStage'] ?? '').replace(/_/g, ' ')}`;
      case 'ASSIGNMENT':
        return `Assigned to a team member`;
      case 'CALL':
        return `Call ${String(p['direction'] ?? 'outbound')} • ${String(p['status'] ?? '')}`;
      case 'QUOTATION_SENT':
        return `Quotation sent via ${String(p['sentVia'] ?? 'email')}`;
      case 'APPOINTMENT_BOOKED':
        return `Appointment scheduled`;
      case 'WHATSAPP':
        return `WhatsApp message: ${String(p['text'] ?? '').slice(0, 80)}`;
      default:
        return act.type.replace(/_/g, ' ').toLowerCase();
    }
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href="/leads" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={16} /> Leads
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-700 font-medium">{lead.name}</span>
      </div>

      {/* SLA banner */}
      <SlaBanner stage={lead.stage} stageChangedAt={lead.stageChangedAt} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left column ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Lead card */}
          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-slate-800">{lead.name}</h1>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-sm text-slate-600 hover:text-primary transition-colors">
                    <Phone size={14} /> {lead.phone}
                  </a>
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-sm text-slate-600 hover:text-primary transition-colors">
                      <Mail size={14} /> {lead.email}
                    </a>
                  )}
                  {lead.city && (
                    <span className="flex items-center gap-1 text-sm text-slate-600">
                      <MapPin size={14} /> {lead.city}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                {editingStage ? (
                  <div className="flex items-center gap-2">
                    <select
                      autoFocus
                      defaultValue={lead.stage}
                      onChange={(e) => changeStage(e.target.value)}
                      className="text-sm border border-primary rounded-lg px-2 py-1.5 focus:outline-none"
                      disabled={isPending}
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                    <button onClick={() => setEditingStage(false)}>
                      <X size={16} className="text-slate-400" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setEditingStage(true)} className="group flex items-center gap-1.5">
                    <StageBadge stage={lead.stage} />
                    <Edit2 size={12} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock size={11} />
                  {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>
          </div>

          {/* Duplicates — only shown when same-phone leads exist */}
          <DuplicatesCard masterId={id} />

          {/* Activity feed */}
          <div className="bg-white rounded-xl border border-border">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-slate-800">Activity</h2>
              <button
                onClick={() => setAddingNote(!addingNote)}
                className="text-sm text-primary hover:underline font-medium"
              >
                + Add note
              </button>
            </div>

            {addingNote && (
              <div className="px-5 py-4 border-b border-border bg-slate-50/50">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Write a note about this lead..."
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                  rows={3}
                  autoFocus
                />
                <div className="flex gap-2 mt-2 justify-end">
                  <button onClick={() => { setAddingNote(false); setNoteText(''); }} className="text-sm text-slate-500 hover:text-slate-700">
                    Cancel
                  </button>
                  <button
                    onClick={addNote}
                    disabled={!noteText.trim() || isPending}
                    className="flex items-center gap-1.5 text-sm bg-primary text-white px-3 py-1.5 rounded-lg disabled:opacity-50 hover:bg-primary/90"
                  >
                    <Check size={14} /> Save note
                  </button>
                </div>
              </div>
            )}

            <div className="divide-y divide-border">
              {activities.length === 0 && (
                <p className="px-5 py-8 text-sm text-slate-400 text-center">No activity yet.</p>
              )}
              {activities.map((act) => {
                const cfg = ACTIVITY_CONFIG[act.type] ?? { icon: FileText, color: 'text-slate-500 bg-slate-100', label: act.type };
                const Icon = cfg.icon;
                return (
                  <div key={act.id} className="flex gap-3.5 px-5 py-4">
                    <div className={`w-7 h-7 rounded-full ${cfg.color} flex items-center justify-center shrink-0 mt-0.5`}>
                      <Icon size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 leading-snug">{renderActivityText(act)}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {act.actorIsAi ? (
                          <span className="text-primary font-medium">AI · </span>
                        ) : null}
                        {format(new Date(act.createdAt), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-4">
          {/* Source & intelligence */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Lead Intelligence</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <dt className="text-slate-500">Source</dt>
                <dd className="text-slate-700 font-medium">{SOURCE_LABELS[lead.sourceType] ?? lead.sourceType}</dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-slate-500">AI Score</dt>
                <dd>
                  <ScoreWithBreakdown
                    score={lead.aiScore}
                    breakdown={lead.aiScoreBreakdown}
                  />
                </dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-slate-500">In stage since</dt>
                <dd className="text-slate-700">{formatDistanceToNow(new Date(lead.stageChangedAt), { addSuffix: true })}</dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-slate-500">Received</dt>
                <dd className="text-slate-700">{format(new Date(lead.createdAt), 'MMM d, yyyy')}</dd>
              </div>
            </dl>
          </div>

          {/* UTM Attribution */}
          <UtmCard lead={lead} />

          {/* Calls */}
          <div className="bg-white rounded-xl border border-border">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Calls</h2>
              <span className="text-xs text-slate-400">{calls.length} total</span>
            </div>
            <div className="divide-y divide-border">
              {calls.length === 0 && (
                <p className="px-5 py-5 text-sm text-slate-400 text-center">No calls yet.</p>
              )}
              {calls.slice(0, 8).map((call) => (
                <div key={call.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      {call.persona.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-xs font-medium ${
                      call.status === 'COMPLETED' ? 'text-success' :
                      call.status === 'FAILED' || call.status === 'NO_ANSWER' ? 'text-danger' :
                      'text-slate-500'
                    }`}>
                      {call.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    <span>{format(new Date(call.initiatedAt), 'MMM d, h:mm a')}</span>
                    {call.durationSec && <span>· {Math.floor(call.durationSec / 60)}m {call.durationSec % 60}s</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Appointments */}
          <div className="bg-white rounded-xl border border-border">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-slate-800">Appointments</h2>
            </div>
            <div className="px-5 py-4">
              <AppointmentsList leadId={id} />
            </div>
          </div>

          {/* Assignment */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Assignment</h3>
            <AssignLeadPanel leadId={lead.id} currentOwnerId={lead.ownerUserId ?? null} />
          </div>

          {/* Tags */}
          <LeadTagsCard
            leadId={lead.id}
            tags={lead.tags}
          />

          {/* AI Summary */}
          <LeadSummaryCard leadId={lead.id} />
        </div>
      </div>
    </div>
  );
}
