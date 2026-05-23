'use client';

import { useParams } from 'next/navigation';
import { useState, useRef } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowLeft, Loader2, Plus, Send, Camera, Trash2, X,
  MessageSquare, ArrowRight, CheckCircle2, CalendarClock,
  UserCheck, Clock, Wrench, AlertTriangle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  useServiceTicket,
  useUpdateServiceTicket,
  useAddTicketComment,
  useUploadTicketPhoto,
  useDeleteTicketPhoto,
  useNotifyTicket,
  SERVICE_TICKET_STATUSES,
  STATUS_LABEL,
  TYPE_LABEL,
  SLA_RESOLVE_HOURS,
  type ServiceTicketStatus,
  type ActivityEntry,
} from '@/hooks/use-service-tickets';

// ── SLA helpers ───────────────────────────────────────────────────────────────
function slaInfo(priority: string, createdAt: string, resolvedAt: string | null, status: string) {
  if (status === 'RESOLVED' || status === 'CLOSED') return { label: 'Resolved', color: 'text-success', bg: 'bg-success/10' };
  const hours    = SLA_RESOLVE_HOURS[priority] ?? 120;
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / 3600000;
  const remaining = hours - ageHours;
  if (remaining < 0) {
    return { label: `Overdue ${Math.abs(Math.round(remaining))}h`, color: 'text-danger', bg: 'bg-red-50' };
  }
  if (remaining < hours * 0.25) {
    return { label: `${Math.round(remaining)}h remaining`, color: 'text-amber-600', bg: 'bg-amber-50' };
  }
  return { label: `${Math.round(remaining)}h remaining`, color: 'text-success', bg: 'bg-success/10' };
}

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

interface UserOption { id: string; name: string; role: string }

function useEngineers() {
  return useQuery({
    queryKey: ['users', 'engineers'],
    queryFn: () =>
      api.get<{ data: UserOption[] }>('/users')
        .then((r) => r.data.data.filter((u) => u.role === 'ENGINEER'))
        .catch(() => [] as UserOption[]),
  });
}

// ── Activity entry renderer ───────────────────────────────────────────────────
function TimelineEntry({
  entry,
  ticketId,
  onDeletePhoto,
}: {
  entry: ActivityEntry;
  ticketId: string;
  onDeletePhoto: (photoId: string) => void;
}) {
  const timeAgo = formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true });

  const iconMap: Record<ActivityEntry['type'], React.ReactNode> = {
    created:        <Wrench size={13} className="text-slate-400" />,
    status_change:  <ArrowRight size={13} className="text-blue-400" />,
    comment:        <MessageSquare size={13} className="text-primary" />,
    photo:          <Camera size={13} className="text-green-500" />,
    visit_scheduled:<CalendarClock size={13} className="text-violet-500" />,
    assigned:       <UserCheck size={13} className="text-amber-500" />,
    sla_breach:     <AlertTriangle size={13} className="text-danger" />,
  };

  const iconBg: Record<ActivityEntry['type'], string> = {
    created:         'bg-slate-100',
    status_change:   'bg-blue-100',
    comment:         'bg-primary/10',
    photo:           'bg-green-100',
    visit_scheduled: 'bg-violet-100',
    assigned:        'bg-amber-100',
    sla_breach:      'bg-red-100',
  };

  return (
    <div className="flex gap-3">
      {/* Icon dot */}
      <div className="flex flex-col items-center shrink-0">
        <div className={`h-7 w-7 rounded-full flex items-center justify-center ${iconBg[entry.type]}`}>
          {iconMap[entry.type]}
        </div>
        <div className="flex-1 w-px bg-border mt-1" />
      </div>

      {/* Content */}
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap mb-1">
          <span className="text-xs font-semibold text-slate-700">{entry.authorName}</span>
          <span className="text-[11px] text-slate-400">{timeAgo}</span>
        </div>

        {entry.type === 'created' && (
          <p className="text-sm text-slate-500">Ticket created</p>
        )}

        {entry.type === 'status_change' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[entry.fromStatus as ServiceTicketStatus] ?? 'bg-slate-100 text-slate-500'}`}>
              {STATUS_LABEL[entry.fromStatus as ServiceTicketStatus] ?? entry.fromStatus}
            </span>
            <ArrowRight size={12} className="text-slate-400 shrink-0" />
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[entry.toStatus as ServiceTicketStatus] ?? 'bg-slate-100 text-slate-500'}`}>
              {STATUS_LABEL[entry.toStatus as ServiceTicketStatus] ?? entry.toStatus}
            </span>
          </div>
        )}

        {entry.type === 'comment' && (
          <div className="rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-slate-700 whitespace-pre-wrap">
            {entry.text}
          </div>
        )}

        {entry.type === 'photo' && entry.photoUrl && (
          <div className="group relative inline-block rounded-xl overflow-hidden border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={entry.photoUrl} alt={entry.caption ?? 'Site photo'} className="max-h-48 max-w-xs object-cover" />
            {entry.caption && (
              <div className="bg-black/50 px-2 py-1">
                <p className="text-[11px] text-white">{entry.caption}</p>
              </div>
            )}
            <button
              onClick={() => onDeletePhoto(entry.id)}
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-danger opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}

        {entry.type === 'visit_scheduled' && (
          <p className="text-sm text-slate-600">
            Visit scheduled for{' '}
            <span className="font-semibold text-slate-800">
              {format(new Date(entry.visitAt!), 'd MMM yyyy, h:mm a')}
            </span>
          </p>
        )}

        {entry.type === 'assigned' && (
          <p className="text-sm text-slate-600">
            Assigned to <span className="font-semibold text-slate-800">{entry.engineerName}</span>
          </p>
        )}

        {entry.type === 'sla_breach' && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-danger font-medium">
            {entry.text}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ServiceTicketDetailPage() {
  const params   = useParams();
  const id       = String(params['id']);
  const { data: ticket, isLoading, isError } = useServiceTicket(id);
  const update         = useUpdateServiceTicket();
  const addComment     = useAddTicketComment();
  const uploadPhoto    = useUploadTicketPhoto();
  const deletePhoto    = useDeleteTicketPhoto();
  const notifyTicket   = useNotifyTicket();
  const { data: engineers = [] } = useEngineers();

  const [comment, setComment]           = useState('');
  const [editSubject, setEditSubject]   = useState(false);
  const [subjectDraft, setSubjectDraft] = useState('');
  const [editDesc, setEditDesc]         = useState(false);
  const [descDraft, setDescDraft]       = useState('');
  const [captionDraft, setCaptionDraft] = useState('');
  const [notifyOpen, setNotifyOpen]     = useState(false);
  const [notifyMsg, setNotifyMsg]       = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-32 animate-pulse rounded-2xl border border-border bg-white" />
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-white" />
      </div>
    );
  }
  if (isError || !ticket) {
    return <p className="text-danger text-sm">Failed to load ticket. Please refresh.</p>;
  }

  const sla = slaInfo(ticket.priority, ticket.createdAt, ticket.resolvedAt, ticket.status);

  async function patch(data: Record<string, unknown>, msg: string) {
    try {
      await update.mutateAsync({ id, data });
      toast.success(msg);
    } catch {
      toast.error('Update failed');
    }
  }

  async function handleComment() {
    const text = comment.trim();
    if (!text) return;
    try {
      await addComment.mutateAsync({ id, text });
      setComment('');
    } catch {
      toast.error('Failed to add comment');
    }
  }

  async function handlePhotoUpload(file: File) {
    try {
      await uploadPhoto.mutateAsync({ id, file, ...(captionDraft.trim() ? { caption: captionDraft.trim() } : {}) });
      setCaptionDraft('');
      toast.success('Photo uploaded');
    } catch {
      toast.error('Upload failed');
    }
  }

  async function handleDeletePhoto(photoId: string) {
    try {
      await deletePhoto.mutateAsync({ id, photoId });
      toast.success('Photo removed');
    } catch {
      toast.error('Delete failed');
    }
  }

  // Synthesize a 'created' entry if the log is empty (legacy tickets)
  const timelineEntries: ActivityEntry[] =
    ticket.activityLog.length > 0
      ? ticket.activityLog
      : [{
          id: 'created-legacy',
          type: 'created',
          authorName: ticket.createdByUserName ?? 'System',
          authorId:   ticket.createdByUserId ?? '',
          createdAt:  ticket.createdAt,
        }];

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link href="/service-tickets" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} /> All Tickets
      </Link>

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[ticket.status]}`}>
              {STATUS_LABEL[ticket.status]}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_BADGE[ticket.priority] ?? 'bg-slate-100 text-slate-600'}`}>
              {ticket.priority}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${sla.bg} ${sla.color}`}>
              <Clock size={10} className="inline mr-0.5" />
              {sla.label}
            </span>
            <span className="text-xs text-slate-400">{TYPE_LABEL[ticket.type]}</span>
          </div>

          {editSubject ? (
            <div className="flex items-center gap-2">
              <input
                value={subjectDraft}
                onChange={(e) => setSubjectDraft(e.target.value)}
                maxLength={200}
                className="text-lg font-bold text-slate-900 border-b border-primary outline-none bg-transparent"
                autoFocus
              />
              <button
                onClick={() => { void patch({ subject: subjectDraft }, 'Subject updated'); setEditSubject(false); }}
                className="text-xs text-primary font-semibold"
              >Save</button>
              <button onClick={() => setEditSubject(false)} className="text-slate-400"><X size={13} /></button>
            </div>
          ) : (
            <h1
              className="text-lg font-bold text-slate-900 cursor-pointer hover:text-primary transition-colors"
              onClick={() => { setSubjectDraft(ticket.subject); setEditSubject(true); }}
            >
              {ticket.subject}
            </h1>
          )}

          <p className="text-sm text-slate-500">
            <Link href={`/leads/${ticket.lead.id}`} className="text-primary hover:underline">{ticket.lead.name}</Link>
            {ticket.project && (
              <>
                {' · '}
                <Link href={`/projects/${ticket.project.id}`} className="text-primary hover:underline">
                  {ticket.project.number}
                </Link>
              </>
            )}
            {' · Created '}
            {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
          </p>
        </div>

        {/* Quick status actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {ticket.status === 'OPEN' && (
            <button
              onClick={() => void patch({ status: 'IN_PROGRESS' }, 'Marked in progress')}
              disabled={update.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {update.isPending ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
              Start Working
            </button>
          )}
          {(ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS') && (
            <button
              onClick={() => void patch({ status: 'RESOLVED' }, 'Ticket resolved')}
              disabled={update.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-success px-3 py-2 text-sm font-semibold text-white hover:bg-success/90 transition-colors disabled:opacity-50"
            >
              {update.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Mark Resolved
            </button>
          )}
          {ticket.status === 'RESOLVED' && (
            <button
              onClick={() => void patch({ status: 'CLOSED' }, 'Ticket closed')}
              disabled={update.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Close Ticket
            </button>
          )}
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left column ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Description */}
          <div className="rounded-2xl border border-border bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Description</h3>
              {!editDesc && (
                <button
                  onClick={() => { setDescDraft(ticket.description); setEditDesc(true); }}
                  className="text-xs text-slate-400 hover:text-primary transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
            {editDesc ? (
              <div className="space-y-2">
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  rows={5}
                  maxLength={5000}
                  className="w-full resize-y rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { void patch({ description: descDraft }, 'Description updated'); setEditDesc(false); }}
                    className="rounded-xl bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditDesc(false)}
                    className="rounded-xl border border-border px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
            )}
          </div>

          {/* Activity Timeline */}
          <div className="rounded-2xl border border-border bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Activity Timeline</h3>
            <div>
              {timelineEntries.map((entry, idx) => (
                <div key={entry.id} className={idx === timelineEntries.length - 1 ? '[&>div>div:nth-child(1)>div:nth-child(2)]:hidden' : ''}>
                  <TimelineEntry
                    entry={entry}
                    ticketId={id}
                    onDeletePhoto={handleDeletePhoto}
                  />
                </div>
              ))}
            </div>

            {/* Add Comment */}
            <div className="mt-2 space-y-2 border-t border-border pt-4">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Add a comment, update, or resolution note…"
                className="w-full resize-none rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleComment();
                }}
              />
              <div className="flex items-center justify-between flex-wrap gap-2">
                {/* Photo upload */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadPhoto.isPending}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {uploadPhoto.isPending ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                    Photo
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handlePhotoUpload(f);
                      e.target.value = '';
                    }}
                  />
                  {uploadPhoto.isPending && (
                    <span className="text-xs text-slate-400">Uploading…</span>
                  )}
                </div>
                <button
                  onClick={() => void handleComment()}
                  disabled={!comment.trim() || addComment.isPending}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {addComment.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  Comment
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-5">

          {/* Ticket details */}
          <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Ticket Details</h3>
            <div className="space-y-2 text-sm">
              <DetailRow label="Type"     value={TYPE_LABEL[ticket.type]} />
              <DetailRow label="Priority">
                <div className="flex items-center gap-1.5">
                  {(ticket.priority === 'P1' || ticket.priority === 'P2') && (
                    <AlertTriangle size={12} className="text-danger" />
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_BADGE[ticket.priority] ?? ''}`}>
                    {ticket.priority}
                  </span>
                  <span className="text-xs text-slate-400">({SLA_RESOLVE_HOURS[ticket.priority] ?? '?'}h SLA)</span>
                </div>
              </DetailRow>
              <DetailRow label="Status">
                <select
                  value={ticket.status}
                  onChange={(e) => void patch({ status: e.target.value }, `Status → ${STATUS_LABEL[e.target.value as ServiceTicketStatus]}`)}
                  className={`text-xs font-semibold rounded-full px-2.5 py-1 border-0 cursor-pointer focus:outline-none ${STATUS_BADGE[ticket.status]}`}
                >
                  {SERVICE_TICKET_STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </DetailRow>
              <DetailRow label="Created"  value={format(new Date(ticket.createdAt), 'd MMM yyyy, h:mm a')} />
              {ticket.resolvedAt && (
                <DetailRow label="Resolved" value={format(new Date(ticket.resolvedAt), 'd MMM yyyy, h:mm a')} />
              )}
              {ticket.createdByUserName && (
                <DetailRow label="Raised by" value={ticket.createdByUserName} />
              )}
            </div>
          </div>

          {/* Assign engineer */}
          <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Assigned Engineer</h3>
            <select
              value={ticket.assignedEngineerId ?? ''}
              onChange={(e) => void patch({ assignedEngineerId: e.target.value || null }, e.target.value ? 'Engineer assigned' : 'Engineer unassigned')}
              className="w-full rounded-xl border border-border bg-white py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Unassigned</option>
              {engineers.map((eng) => (
                <option key={eng.id} value={eng.id}>{eng.name}</option>
              ))}
            </select>
            {ticket.assignedEngineerName && (
              <p className="text-xs text-slate-500">Currently: {ticket.assignedEngineerName}</p>
            )}
          </div>

          {/* Schedule visit */}
          <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <CalendarClock size={14} /> Schedule Visit
            </h3>
            {ticket.scheduledVisitAt && (
              <div className="rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-800 font-medium">
                {format(new Date(ticket.scheduledVisitAt), 'd MMM yyyy, h:mm a')}
              </div>
            )}
            <VisitScheduler
              current={ticket.scheduledVisitAt}
              onSave={(dt) => void patch({ scheduledVisitAt: dt }, 'Visit scheduled')}
            />
          </div>

          {/* Customer */}
          <div className="rounded-2xl border border-border bg-white p-5 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Customer</h3>
              <button
                onClick={() => {
                  setNotifyMsg(`Hi ${ticket.lead.name}, this is an update regarding your service request "${ticket.subject}". Current status: ${STATUS_LABEL[ticket.status]}. Please contact us if you have any questions.`);
                  setNotifyOpen((o) => !o);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-primary transition-colors"
              >
                <MessageSquare size={11} /> WhatsApp
              </button>
            </div>
            <div className="text-sm space-y-1.5">
              <DetailRow label="Name"  value={ticket.lead.name} />
              <DetailRow label="Phone" value={ticket.lead.phone} />
              {ticket.lead.email && <DetailRow label="Email" value={ticket.lead.email} />}
              {ticket.lead.city  && <DetailRow label="City"  value={ticket.lead.city} />}
            </div>
            {notifyOpen && (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <textarea
                  value={notifyMsg}
                  onChange={(e) => setNotifyMsg(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  className="w-full resize-none rounded-xl border border-border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!notifyMsg.trim()) return;
                      try {
                        await notifyTicket.mutateAsync({ id, message: notifyMsg.trim() });
                        toast.success('WhatsApp sent');
                        setNotifyOpen(false);
                      } catch {
                        toast.error('Send failed');
                      }
                    }}
                    disabled={notifyTicket.isPending}
                    className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {notifyTicket.isPending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                    Send
                  </button>
                  <button
                    onClick={() => setNotifyOpen(false)}
                    className="rounded-xl border border-border px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <Link href={`/leads/${ticket.lead.id}`} className="mt-2 block text-xs text-primary hover:underline">
              View lead profile →
            </Link>
          </div>

          {/* Linked project */}
          {ticket.project && (
            <div className="rounded-2xl border border-border bg-white p-5 space-y-2">
              <h3 className="text-sm font-semibold text-slate-700">Linked Project</h3>
              <Link
                href={`/projects/${ticket.project.id}`}
                className="flex items-center justify-between rounded-xl border border-border px-3 py-2 hover:bg-slate-50 transition-colors"
              >
                <span className="text-sm font-medium text-primary">{ticket.project.number}</span>
                <span className="text-xs text-slate-400">{ticket.project.stage.replace(/_/g, ' ')}</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function DetailRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-400 text-xs shrink-0">{label}</span>
      {children ? children : <span className="text-slate-700 text-xs text-right">{value ?? '—'}</span>}
    </div>
  );
}

function VisitScheduler({
  current,
  onSave,
}: {
  current: string | null;
  onSave: (dt: string) => void;
}) {
  const [dt, setDt] = useState(
    current ? new Date(current).toISOString().slice(0, 16) : '',
  );
  const changed = dt !== (current ? new Date(current).toISOString().slice(0, 16) : '');
  return (
    <div className="space-y-2">
      <input
        type="datetime-local"
        value={dt}
        onChange={(e) => setDt(e.target.value)}
        className="w-full rounded-xl border border-border bg-white py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {changed && dt && (
        <button
          onClick={() => onSave(new Date(dt).toISOString())}
          className="w-full rounded-xl bg-primary py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
        >
          Save Visit Date
        </button>
      )}
    </div>
  );
}
