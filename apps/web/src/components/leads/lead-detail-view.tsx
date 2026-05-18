'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow, format } from 'date-fns';
import { ArrowLeft, Phone, Mail, MapPin, Clock, Edit2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useLeadDetail, useUpdateLead } from '@/hooks/use-leads';
import { StageBadge } from './stage-badge';
import { AppointmentsList } from '@/components/appointments/appointments-list';
import { AssignLeadPanel } from './assign-lead-panel';

const STAGES = ['NEW', 'QUALIFIED', 'FOLLOW_UP', 'CONVERTED', 'NOT_ANSWERED', 'INVALID', 'WRONG_ENQUIRY'];

const ACTIVITY_ICONS: Record<string, string> = {
  NOTE: '📝',
  STAGE_CHANGE: '🔄',
  ASSIGNMENT: '👤',
  CALL: '📞',
  WHATSAPP: '💬',
};

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

  const activities = (lead as unknown as { activities?: { id: string; type: string; payload: Record<string, unknown>; createdAt: string }[] }).activities ?? [];
  const calls = (lead as unknown as { calls?: { id: string; status: string; persona: string; durationSec: number | null; initiatedAt: string }[] }).calls ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/leads" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={16} /> Leads
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-700 font-medium">{lead.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main card */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-xl font-bold text-slate-800">{lead.name}</h1>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  <span className="flex items-center gap-1 text-sm text-slate-600"><Phone size={14} /> {lead.phone}</span>
                  {lead.email && <span className="flex items-center gap-1 text-sm text-slate-600"><Mail size={14} /> {lead.email}</span>}
                  {lead.city && <span className="flex items-center gap-1 text-sm text-slate-600"><MapPin size={14} /> {lead.city}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {editingStage ? (
                  <select
                    autoFocus
                    defaultValue={lead.stage}
                    onChange={(e) => changeStage(e.target.value)}
                    onBlur={() => setEditingStage(false)}
                    className="text-sm border border-primary rounded-lg px-2 py-1 focus:outline-none"
                    disabled={isPending}
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </select>
                ) : (
                  <button onClick={() => setEditingStage(true)} className="group flex items-center gap-1">
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

          {/* Activity feed */}
          <div className="bg-white rounded-xl border border-border">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-slate-800">Activity</h2>
              <button
                onClick={() => setAddingNote(!addingNote)}
                className="text-sm text-primary hover:underline"
              >
                + Add note
              </button>
            </div>

            {addingNote && (
              <div className="px-5 py-4 border-b border-border">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Write a note..."
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={3}
                />
                <div className="flex gap-2 mt-2 justify-end">
                  <button onClick={() => setAddingNote(false)} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
                  <button
                    onClick={addNote}
                    disabled={!noteText.trim() || isPending}
                    className="flex items-center gap-1 text-sm bg-primary text-white px-3 py-1 rounded-lg disabled:opacity-50"
                  >
                    <Check size={14} /> Save
                  </button>
                </div>
              </div>
            )}

            <div className="divide-y divide-border">
              {activities.length === 0 && (
                <p className="px-5 py-6 text-sm text-slate-400 text-center">No activity yet.</p>
              )}
              {activities.map((act) => (
                <div key={act.id} className="flex gap-3 px-5 py-3">
                  <span className="text-base mt-0.5">{ACTIVITY_ICONS[act.type] ?? '•'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">
                      {act.type === 'NOTE' && String((act.payload as Record<string, unknown>)['note'] ?? '')}
                      {act.type === 'STAGE_CHANGE' && `Stage changed to ${String((act.payload as Record<string, unknown>)['newStage'] ?? '').replace('_', ' ')}`}
                      {act.type === 'ASSIGNMENT' && `Assigned to user ${String((act.payload as Record<string, unknown>)['assignedTo'] ?? '')}`}
                      {!['NOTE', 'STAGE_CHANGE', 'ASSIGNMENT'].includes(act.type) && act.type}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {format(new Date(act.createdAt), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Calls */}
          <div className="bg-white rounded-xl border border-border">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-slate-800">Calls</h2>
            </div>
            <div className="divide-y divide-border">
              {calls.length === 0 && (
                <p className="px-5 py-4 text-sm text-slate-400">No calls yet.</p>
              )}
              {calls.map((call) => (
                <div key={call.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">{call.persona.replace('_', ' ')}</span>
                    <span className={`text-xs ${call.status === 'COMPLETED' ? 'text-success' : call.status === 'FAILED' ? 'text-danger' : 'text-slate-500'}`}>
                      {call.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    <span>{format(new Date(call.initiatedAt), 'MMM d, h:mm a')}</span>
                    {call.durationSec && <span>· {call.durationSec}s</span>}
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

          {/* Source info */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="font-semibold text-slate-800 mb-3">Source</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Source</dt>
                <dd className="text-slate-700">{lead.sourceType}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">AI Score</dt>
                <dd className="text-slate-700">{lead.aiScore ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Stage since</dt>
                <dd className="text-slate-700">{formatDistanceToNow(new Date(lead.stageChangedAt), { addSuffix: true })}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
