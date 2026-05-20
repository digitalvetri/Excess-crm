'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Check, Loader2, Plus, Image as ImageIcon, Wrench, Share2 } from 'lucide-react';
import { api } from '@/lib/api';
import {
  useProject,
  useUpdateProject,
  useProjectPortalLink,
  PROJECT_STAGES,
  STAGE_LABEL,
  type ProjectStage,
} from '@/hooks/use-projects';

interface UserOption {
  id: string;
  name: string;
  role: string;
}

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

const STAGE_TIMESTAMP: { stage: ProjectStage; field: keyof TimestampFields; label: string }[] = [
  { stage: 'DESIGN', field: 'surveyDoneAt', label: 'Survey done' },
  { stage: 'MATERIAL_ORDERED', field: 'designApprovedAt', label: 'Design approved' },
  { stage: 'MATERIAL_ORDERED', field: 'materialOrderedAt', label: 'Material ordered' },
  { stage: 'COMMISSIONING', field: 'installStartedAt', label: 'Install started' },
  { stage: 'COMMISSIONING', field: 'commissionedAt', label: 'Commissioned' },
  { stage: 'HANDED_OVER', field: 'handedOverAt', label: 'Handed over' },
];

interface TimestampFields {
  surveyDoneAt: string | null;
  designApprovedAt: string | null;
  materialOrderedAt: string | null;
  installStartedAt: string | null;
  commissionedAt: string | null;
  handedOverAt: string | null;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const id = String(params['id']);
  const { data: project, isLoading, isError } = useProject(id);
  const update = useUpdateProject();
  const portalLink = useProjectPortalLink();
  const { data: engineers = [] } = useEngineers();

  const [photoUrl, setPhotoUrl] = useState('');
  const [photoCaption, setPhotoCaption] = useState('');
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  if (isLoading) {
    return <div className="h-64 bg-white rounded-xl border border-border animate-pulse" />;
  }
  if (isError || !project) {
    return <p className="text-danger text-sm">Failed to load project. Please refresh.</p>;
  }

  const currentIndex = PROJECT_STAGES.indexOf(project.stage);
  const nextStage = PROJECT_STAGES[currentIndex + 1];

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
    const photos = [
      ...project.photos,
      { stage: project.stage, url: photoUrl.trim(), caption: photoCaption.trim() || undefined, addedAt: new Date().toISOString() },
    ];
    void patch({ photos }, 'Photo added');
    setPhotoUrl('');
    setPhotoCaption('');
  }

  function removePhoto(idx: number) {
    if (!project) return;
    const photos = project.photos.filter((_, i) => i !== idx);
    void patch({ photos }, 'Photo removed');
  }

  async function handleShareLink() {
    try {
      const res = await portalLink.mutateAsync(id);
      await navigator.clipboard.writeText(res.url);
      toast.success('Customer status link copied to clipboard');
    } catch {
      toast.error('Failed to generate link');
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={15} /> All projects
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{project.number}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            <Link href={`/leads/${project.lead.id}`} className="text-primary hover:underline">
              {project.lead.name}
            </Link>
            {' · '}
            {project.lead.phone}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleShareLink()}
            disabled={portalLink.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {portalLink.isPending ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
            Share status link
          </button>
          {nextStage && (
            <button
              onClick={() => void patch({ stage: nextStage }, `Advanced to ${STAGE_LABEL[nextStage]}`)}
              disabled={update.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {update.isPending && <Loader2 size={14} className="animate-spin" />}
              Advance to {STAGE_LABEL[nextStage]}
            </button>
          )}
        </div>
      </div>

      {/* Stage tracker */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center">
          {PROJECT_STAGES.map((stage, idx) => {
            const done = idx < currentIndex;
            const current = idx === currentIndex;
            return (
              <div key={stage} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                      done
                        ? 'bg-success text-white'
                        : current
                          ? 'bg-primary text-white ring-4 ring-primary/15'
                          : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {done ? <Check size={15} /> : idx + 1}
                  </div>
                  <span
                    className={`text-[11px] font-medium whitespace-nowrap ${
                      current ? 'text-primary' : done ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — milestones, photos */}
        <div className="lg:col-span-2 space-y-6">
          {/* Milestones */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Milestones</h3>
            <div className="space-y-2">
              {STAGE_TIMESTAMP.map(({ field, label }) => {
                const ts = project[field];
                return (
                  <div key={field} className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{label}</span>
                    <span className={ts ? 'text-slate-800 font-medium' : 'text-slate-300'}>
                      {ts ? new Date(ts).toLocaleDateString('en-IN') : 'Pending'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Photos */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              <ImageIcon size={15} /> Site Photos ({project.photos.length})
            </h3>
            {project.photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                {project.photos.map((photo, idx) => (
                  <div key={idx} className="group relative rounded-lg overflow-hidden border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={photo.caption ?? 'Site photo'} className="w-full h-28 object-cover" />
                    <div className="absolute bottom-0 inset-x-0 bg-black/50 px-2 py-1">
                      <p className="text-[10px] text-white truncate">{photo.caption ?? photo.stage}</p>
                    </div>
                    <button
                      onClick={() => removePhoto(idx)}
                      className="absolute top-1 right-1 bg-white/90 text-danger rounded-full w-5 h-5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
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
                className="flex-1 min-w-[160px] text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                placeholder="Caption (optional)"
                className="flex-1 min-w-[140px] text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={addPhoto}
                disabled={!photoUrl.trim()}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm hover:bg-slate-200 transition-colors disabled:opacity-40"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Notes</h3>
            <textarea
              value={notesDraft ?? project.notes ?? ''}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={4}
              placeholder="Internal project notes…"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary resize-y"
            />
            {notesDraft !== null && notesDraft !== (project.notes ?? '') && (
              <button
                onClick={() => {
                  void patch({ notes: notesDraft }, 'Notes saved');
                  setNotesDraft(null);
                }}
                className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors"
              >
                Save notes
              </button>
            )}
          </div>

          {/* Service tickets */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              <Wrench size={15} /> Service Tickets ({project.serviceTickets.length})
            </h3>
            {project.serviceTickets.length === 0 ? (
              <p className="text-sm text-slate-400">No service tickets for this project.</p>
            ) : (
              <div className="space-y-2">
                {project.serviceTickets.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm border-b border-border last:border-0 pb-2 last:pb-0">
                    <div>
                      <span className="font-medium text-slate-800">{t.subject}</span>
                      <span className="text-xs text-slate-400 ml-2">{t.type.replace(/_/g, ' ')}</span>
                    </div>
                    <span className="text-xs text-slate-500">{t.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right — details */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-border p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Customer</h3>
            <div className="text-sm space-y-1.5">
              <Row label="Name" value={project.lead.name} />
              <Row label="Phone" value={project.lead.phone} />
              <Row label="Email" value={project.lead.email ?? '—'} />
              <Row
                label="Location"
                value={[project.lead.city, project.lead.state, project.lead.pincode].filter(Boolean).join(', ') || '—'}
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-border p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">System</h3>
            <NumberField
              label="System size (kW)"
              value={project.systemKw}
              onSave={(v) => void patch({ systemKw: v }, 'System size updated')}
            />
            <NumberField
              label="Total value (₹)"
              value={project.totalValueInr}
              onSave={(v) => void patch({ totalValueInr: v }, 'Project value updated')}
            />
          </div>

          <div className="bg-white rounded-xl border border-border p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Engineer</h3>
            <select
              value={project.assignedEngineerId ?? ''}
              onChange={(e) =>
                void patch({ assignedEngineerId: e.target.value || null }, 'Engineer updated')
              }
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="">Unassigned</option>
              {engineers.map((eng) => (
                <option key={eng.id} value={eng.id}>
                  {eng.name}
                </option>
              ))}
            </select>
            {engineers.length === 0 && (
              <p className="text-xs text-slate-400">No engineers available to assign.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-800 text-right">{value}</span>
    </div>
  );
}

function NumberField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const current = parseFloat(value);
  const showSave = draft !== null && draft !== '' && Number(draft) !== current;
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          value={draft ?? current}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {showSave && (
          <button
            onClick={() => {
              onSave(Number(draft));
              setDraft(null);
            }}
            className="px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors"
          >
            Save
          </button>
        )}
      </div>
    </div>
  );
}
