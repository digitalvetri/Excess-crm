'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowLeft, Check, Loader2, Plus, Image as ImageIcon,
  Wrench, Share2, SunMedium, CalendarClock, MessageSquare,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  useProject,
  useUpdateProject,
  useProjectPortalLink,
  useNotifyCustomer,
  PROJECT_STAGES,
  STAGE_LABEL,
  type ProjectStage,
  type ProjectDetail,
} from '@/hooks/use-projects';
import { ProjectChecklist } from '@/components/projects/project-checklist';
import { ProjectDocumentVault } from '@/components/projects/project-document-vault';
import { ProjectPaymentTracker } from '@/components/projects/project-payment-tracker';
import { ProjectSubsidyTracker } from '@/components/projects/project-subsidy-tracker';
import { ProjectNetMeteringTracker } from '@/components/projects/project-net-metering-tracker';
import { RaiseTicketModal } from '@/components/service-tickets/raise-ticket-modal';
import { ProjectGenerationTracker } from '@/components/projects/project-generation-tracker';
import { ProjectRoiCard } from '@/components/projects/project-roi-card';

interface UserOption { id: string; name: string; role: string }

function useEngineers() {
  return useQuery({
    queryKey: ['users', 'engineers'],
    queryFn: () =>
      api
        .get<{ data: UserOption[] }>('/users')
        .then((r) => r.data.data.filter((u) => u.role === 'ENGINEER'))
        .catch(() => [] as UserOption[]),
  });
}

const STAGE_TIMESTAMPS: { field: keyof ProjectDetail; label: string }[] = [
  { field: 'surveyDoneAt',      label: 'Survey done' },
  { field: 'designApprovedAt',  label: 'Design approved' },
  { field: 'materialOrderedAt', label: 'Material ordered' },
  { field: 'installStartedAt',  label: 'Install started' },
  { field: 'commissionedAt',    label: 'Commissioned' },
  { field: 'handedOverAt',      label: 'Handed over' },
];

export default function ProjectDetailPage() {
  const params = useParams();
  const id = String(params['id']);
  const { data: project, isLoading, isError } = useProject(id);
  const update       = useUpdateProject();
  const portalLink   = useProjectPortalLink();
  const notify       = useNotifyCustomer();
  const { data: engineers = [] } = useEngineers();

  const [photoUrl, setPhotoUrl]       = useState('');
  const [photoCaption, setPhotoCaption] = useState('');
  const [notesDraft, setNotesDraft]   = useState<string | null>(null);
  const [raiseTicket, setRaiseTicket] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-32 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-48 animate-pulse rounded-2xl border border-border bg-white" />
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-white" />
      </div>
    );
  }
  if (isError || !project) {
    return <p className="text-danger text-sm">Failed to load project. Please refresh.</p>;
  }

  const currentIndex = PROJECT_STAGES.indexOf(project.stage);
  const nextStage    = PROJECT_STAGES[currentIndex + 1];

  async function patch(data: Record<string, unknown>, successMsg: string) {
    try {
      await update.mutateAsync({ id, data });
      toast.success(successMsg);
    } catch {
      toast.error('Update failed');
    }
  }

  function addPhoto() {
    if (!photoUrl.trim() || !project) return;
    const caption = photoCaption.trim();
    const photos = [
      ...project.photos,
      { stage: project.stage, url: photoUrl.trim(), ...(caption ? { caption } : {}), addedAt: new Date().toISOString() },
    ];
    void patch({ photos }, 'Photo added');
    setPhotoUrl('');
    setPhotoCaption('');
  }

  const isPostCommission = project.stage === 'COMMISSIONING' || project.stage === 'HANDED_OVER';

  async function handleShareLink() {
    try {
      const res = await portalLink.mutateAsync(id);
      await navigator.clipboard.writeText(res.url);
      toast.success('Customer status link copied');
    } catch {
      toast.error('Failed to generate link');
    }
  }

  async function handleNotify() {
    try {
      await notify.mutateAsync(id);
      toast.success('WhatsApp notification sent to customer');
    } catch {
      toast.error('Failed to send notification — check WhatsApp credentials');
    }
  }

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={15} /> All projects
      </Link>

      {/* ── Page header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900">{project.number}</h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {STAGE_LABEL[project.stage]}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            <Link href={`/leads/${project.lead.id}`} className="text-primary hover:underline">
              {project.lead.name}
            </Link>
            {' · '}
            {project.lead.phone}
            {project.lead.city ? ` · ${project.lead.city}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleNotify()}
            disabled={notify.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Send WhatsApp stage update to customer"
          >
            {notify.isPending ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
            Notify
          </button>
          <button
            onClick={() => void handleShareLink()}
            disabled={portalLink.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {portalLink.isPending ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
            Share link
          </button>
          {nextStage && (
            <button
              onClick={() => void patch({ stage: nextStage }, `Advanced to ${STAGE_LABEL[nextStage]}`)}
              disabled={update.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {update.isPending && <Loader2 size={14} className="animate-spin" />}
              Advance → {STAGE_LABEL[nextStage]}
            </button>
          )}
        </div>
      </div>

      {/* ── Stage stepper ── */}
      <div className="rounded-2xl border border-border bg-white px-5 py-4">
        <div className="flex items-center">
          {PROJECT_STAGES.map((stage, idx) => {
            const done    = idx < currentIndex;
            const current = idx === currentIndex;
            return (
              <div key={stage} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                    done    ? 'bg-success text-white' :
                    current ? 'bg-primary text-white ring-4 ring-primary/15' :
                              'bg-slate-100 text-slate-400'
                  }`}>
                    {done ? <Check size={15} /> : idx + 1}
                  </div>
                  <span className={`text-[11px] font-medium whitespace-nowrap ${
                    current ? 'text-primary' : done ? 'text-slate-600' : 'text-slate-300'
                  }`}>
                    {STAGE_LABEL[stage]}
                  </span>
                </div>
                {idx < PROJECT_STAGES.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-5 ${idx < currentIndex ? 'bg-success' : 'bg-slate-100'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left column (2/3) ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Stage checklist */}
          <ProjectChecklist
            projectId={id}
            currentStage={project.stage}
            stageChecklists={project.stageChecklists}
          />

          {/* Document vault */}
          <ProjectDocumentVault
            projectId={id}
            documents={project.documents}
          />

          {/* Payment tracker */}
          <ProjectPaymentTracker
            projectId={id}
            totalValueInr={project.totalValueInr}
            payments={project.payments}
            subsidyScheme={project.subsidyScheme}
            subsidyStatus={project.subsidyStatus ?? null}
            subsidyExpectedAmtInr={project.subsidyExpectedAmtInr ?? null}
            subsidyCreditedAmtInr={project.subsidyCreditedAmtInr ?? null}
            subsidyCreditedAt={project.subsidyCreditedAt ?? null}
          />

          {/* Subsidy pipeline */}
          <ProjectSubsidyTracker
            projectId={id}
            subsidyScheme={project.subsidyScheme}
            subsidyStatus={project.subsidyStatus ?? null}
            subsidyAppRef={project.subsidyAppRef ?? null}
            subsidyExpectedAmtInr={project.subsidyExpectedAmtInr ?? null}
            subsidyAppliedAt={project.subsidyAppliedAt ?? null}
            subsidyInspectionAt={project.subsidyInspectionAt ?? null}
            subsidyApprovedAt={project.subsidyApprovedAt ?? null}
            subsidyPortalUploadAt={project.subsidyPortalUploadAt ?? null}
            subsidyCreditedAt={project.subsidyCreditedAt ?? null}
            subsidyCreditedAmtInr={project.subsidyCreditedAmtInr ?? null}
          />

          {/* Net metering pipeline */}
          <ProjectNetMeteringTracker
            projectId={id}
            netMeteringStatus={project.netMeteringStatus ?? null}
            netMeteringAppRef={project.netMeteringAppRef ?? null}
            netMeteringMeterNumber={project.netMeteringMeterNumber ?? null}
            netMeteringInspectorName={project.netMeteringInspectorName ?? null}
            netMeteringSldAt={project.netMeteringSldAt ?? null}
            netMeteringLoadAt={project.netMeteringLoadAt ?? null}
            netMeteringInspectionAt={project.netMeteringInspectionAt ?? null}
            netMeteringMeterAt={project.netMeteringMeterAt ?? null}
            netMeteringGridSyncAt={project.netMeteringGridSyncAt ?? null}
            netMeteringFirstExportAt={project.netMeteringFirstExportAt ?? null}
          />

          {/* Generation tracker */}
          <ProjectGenerationTracker
            projectId={id}
            generationLog={project.generationLog}
            isPostCommission={isPostCommission}
          />

          {/* ROI card */}
          <ProjectRoiCard
            systemKw={project.systemKw}
            totalValueInr={project.totalValueInr}
            commissionedAt={project.commissionedAt ?? null}
            generationLog={project.generationLog}
            isPostCommission={isPostCommission}
          />

          {/* Site photos */}
          <div className="rounded-2xl border border-border bg-white p-5">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <ImageIcon size={15} /> Site Photos ({project.photos.length})
            </h3>
            {project.photos.length > 0 && (
              <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {project.photos.map((photo, idx) => (
                  <div key={idx} className="group relative overflow-hidden rounded-xl border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={photo.caption ?? 'Site photo'} className="w-full h-28 object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1">
                      <p className="truncate text-[10px] text-white">{photo.caption ?? photo.stage}</p>
                    </div>
                    <button
                      onClick={() => void patch({ photos: project.photos.filter((_, i) => i !== idx) }, 'Photo removed')}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-danger text-xs opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <input
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="Photo URL"
                className="min-w-[160px] flex-1 rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                placeholder="Caption (optional)"
                className="min-w-[140px] flex-1 rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={addPhoto}
                disabled={!photoUrl.trim()}
                className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-40"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-2xl border border-border bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Notes</h3>
            <textarea
              value={notesDraft ?? project.notes ?? ''}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={4}
              placeholder="Internal project notes…"
              className="w-full resize-y rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {notesDraft !== null && notesDraft !== (project.notes ?? '') && (
              <button
                onClick={() => { void patch({ notes: notesDraft }, 'Notes saved'); setNotesDraft(null); }}
                className="mt-2 rounded-xl bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90 transition-colors"
              >
                Save notes
              </button>
            )}
          </div>

          {/* Service tickets */}
          {raiseTicket && (
            <RaiseTicketModal
              defaultProjectId={id}
              onClose={() => setRaiseTicket(false)}
            />
          )}
          <div className="rounded-2xl border border-border bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Wrench size={15} /> Service Tickets ({project.serviceTickets.length})
              </h3>
              <button
                onClick={() => setRaiseTicket(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Plus size={12} /> Raise Ticket
              </button>
            </div>
            {project.serviceTickets.length > 0 && (
              <div className="space-y-2">
                {project.serviceTickets.map((t) => (
                  <div key={t.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0 text-sm">
                    <div>
                      <span className="font-medium text-slate-800">{t.subject}</span>
                      <span className="ml-2 text-xs text-slate-400">{t.type.replace(/_/g, ' ')}</span>
                    </div>
                    <span className="text-xs text-slate-500">{t.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right column (1/3) ── */}
        <div className="space-y-5">

          {/* Customer */}
          <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Customer</h3>
            <div className="text-sm space-y-2">
              <Row label="Name"  value={project.lead.name} />
              <Row label="Phone" value={project.lead.phone} />
              <Row label="Email" value={project.lead.email ?? '—'} />
              <Row
                label="Location"
                value={[project.lead.city, project.lead.state, project.lead.pincode].filter(Boolean).join(', ') || '—'}
              />
            </div>
          </div>

          {/* System */}
          <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <SunMedium size={14} className="text-primary" /> System
            </h3>
            <NumberField
              label="System size (kW)"
              value={project.systemKw}
              onSave={(v) => void patch({ systemKw: v }, 'System size updated')}
            />
            <NumberField
              label="Total value (₹)"
              value={project.totalValueInr}
              onSave={(v) => void patch({ totalValueInr: v }, 'Value updated')}
            />
          </div>

          {/* Timeline milestones */}
          <div className="rounded-2xl border border-border bg-white p-5">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <CalendarClock size={14} /> Milestones
            </h3>
            <div className="space-y-2">
              {STAGE_TIMESTAMPS.map(({ field, label }) => {
                const val = project[field] as string | null;
                return (
                  <div key={field} className="flex items-center justify-between text-sm">
                    <span className="text-slate-400 text-xs">{label}</span>
                    <span className={val ? 'text-slate-700 font-medium text-xs' : 'text-slate-200 text-xs'}>
                      {val ? format(new Date(val), 'd MMM yyyy') : 'Pending'}
                    </span>
                  </div>
                );
              })}
              {project.expectedCompletionAt && (
                <div className="flex items-center justify-between text-sm pt-1 border-t border-border mt-1">
                  <span className="text-slate-400 text-xs">Expected completion</span>
                  <span className="text-amber-600 font-medium text-xs">
                    {format(new Date(project.expectedCompletionAt), 'd MMM yyyy')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Engineer */}
          <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Assigned Engineer</h3>
            <select
              value={project.assignedEngineerId ?? ''}
              onChange={(e) => void patch({ assignedEngineerId: e.target.value || null }, 'Engineer updated')}
              className="w-full rounded-xl border border-border bg-white py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Unassigned</option>
              {engineers.map((eng) => (
                <option key={eng.id} value={eng.id}>{eng.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400 text-xs shrink-0">{label}</span>
      <span className="text-slate-800 text-xs text-right">{value}</span>
    </div>
  );
}

function NumberField({ label, value, onSave }: { label: string; value: string; onSave: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const current   = parseFloat(value);
  const showSave  = draft !== null && draft !== '' && Number(draft) !== current;
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          value={draft ?? current}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {showSave && (
          <button
            onClick={() => { onSave(Number(draft)); setDraft(null); }}
            className="rounded-xl bg-primary px-3 py-2 text-sm text-white hover:bg-primary/90 transition-colors"
          >
            Save
          </button>
        )}
      </div>
    </div>
  );
}
