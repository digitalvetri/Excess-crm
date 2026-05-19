'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { AlertCircle, Phone, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useLeads, useUpdateLead, type Lead } from '@/hooks/use-leads';
import { useSearchParams } from 'next/navigation';

const PIPELINE_STAGES = [
  { stage: 'NEW', label: 'New', topColor: 'border-t-blue-400' },
  { stage: 'QUALIFIED', label: 'Qualified', topColor: 'border-t-green-500' },
  { stage: 'FOLLOW_UP', label: 'Follow Up', topColor: 'border-t-amber-400' },
  { stage: 'NOT_ANSWERED', label: 'Not Answered', topColor: 'border-t-red-400' },
  { stage: 'CONVERTED', label: 'Converted', topColor: 'border-t-emerald-500' },
];

const SOURCE_SHORT: Record<string, string> = {
  META: 'Meta',
  INDIAMART: 'IND',
  JUSTDIAL: 'JD',
  WEBSITE: 'Web',
  WHATSAPP: 'WA',
  MANUAL: 'Manual',
  PHONE_INBOUND: 'Call',
};

function StaleBadge({ stageChangedAt }: { stageChangedAt: string }) {
  const hours = (Date.now() - new Date(stageChangedAt).getTime()) / 3600000;
  if (hours < 24) return null;
  const isRotten = hours > 72;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
        isRotten ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'
      }`}
    >
      <AlertCircle size={9} />
      {isRotten ? `${Math.floor(hours / 24)}d` : `${Math.floor(hours)}h`}
    </span>
  );
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return null;
  const className =
    score >= 80
      ? 'bg-green-100 text-green-700'
      : score >= 50
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-500';
  return (
    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${className}`}>
      {score}
    </span>
  );
}

function KanbanCard({
  lead,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  lead: Lead;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`bg-white border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all select-none ${
        isDragging ? 'opacity-40 scale-95' : ''
      }`}
    >
      <Link href={`/leads/${lead.id}`} draggable={false}>
        <div className="flex items-start justify-between gap-1.5">
          <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-1">{lead.name}</p>
          <ScorePill score={lead.aiScore} />
        </div>
        <div className="flex items-center gap-1 mt-1">
          <Phone size={10} className="text-slate-400 shrink-0" />
          <span className="text-xs text-slate-500">{lead.phone}</span>
        </div>
        {lead.city && (
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin size={10} className="text-slate-400 shrink-0" />
            <span className="text-xs text-slate-400 line-clamp-1">{lead.city}</span>
          </div>
        )}
        {lead.tags && lead.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {lead.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
            {lead.tags.length > 2 && (
              <span className="text-[10px] text-slate-400">+{lead.tags.length - 2}</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-full border border-border">
            {SOURCE_SHORT[lead.sourceType] ?? lead.sourceType}
          </span>
          <StaleBadge stageChangedAt={lead.stageChangedAt} />
        </div>
      </Link>
    </div>
  );
}

function KanbanColumn({
  stage,
  label,
  topColor,
  leads,
  dragOverStage,
  draggingId,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onDragEnd,
}: {
  stage: string;
  label: string;
  topColor: string;
  leads: Lead[];
  dragOverStage: string | null;
  draggingId: string | null;
  onDragOver: (stage: string) => void;
  onDragLeave: () => void;
  onDrop: (targetStage: string) => void;
  onDragStart: (leadId: string) => void;
  onDragEnd: () => void;
}) {
  const isOver = dragOverStage === stage;

  return (
    <div
      className={`flex flex-col min-w-[224px] w-[224px] rounded-xl border border-t-4 transition-colors ${topColor} ${
        isOver ? 'border-primary/40 bg-primary/5' : 'border-border bg-slate-50'
      }`}
      onDragOver={(e) => { e.preventDefault(); onDragOver(stage); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(stage); }}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        <span className="text-xs bg-white border border-border text-slate-500 font-semibold px-2 py-0.5 rounded-full min-w-[24px] text-center">
          {leads.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 p-2 overflow-y-auto flex-1" style={{ maxHeight: 'calc(100vh - 220px)' }}>
        {leads.length === 0 && !isOver && (
          <div className="flex items-center justify-center py-10 text-xs text-slate-400 italic">
            No leads
          </div>
        )}
        {isOver && draggingId && (
          <div className="border-2 border-dashed border-primary/30 rounded-lg h-16 flex items-center justify-center text-xs text-primary/60">
            Drop here
          </div>
        )}
        {leads.map((lead) => (
          <KanbanCard
            key={lead.id}
            lead={lead}
            isDragging={draggingId === lead.id}
            onDragStart={() => onDragStart(lead.id)}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </div>
  );
}

export function LeadsKanban() {
  const searchParams = useSearchParams();
  const urlParams = Object.fromEntries(searchParams.entries());
  // Strip 'stage' from URL params so kanban always shows all pipeline stages
  const { stage: _stage, ...kanbanParams } = urlParams;
  const { data, isLoading, isError } = useLeads(kanbanParams);
  const updateLead = useUpdateLead();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingStage, setDraggingStage] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const dragTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((col) => (
          <div
            key={col.stage}
            className={`min-w-[224px] w-[224px] h-64 rounded-xl border border-t-4 ${col.topColor} border-border bg-slate-50 animate-pulse`}
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 text-center">
        <p className="text-red-600 text-sm">Failed to load leads. Please refresh.</p>
      </div>
    );
  }

  const allLeads = data?.leads ?? [];

  const leadsByStage = PIPELINE_STAGES.reduce<Record<string, Lead[]>>((acc, col) => {
    acc[col.stage] = allLeads.filter((l) => l.stage === col.stage);
    return acc;
  }, {});

  function handleDragStart(leadId: string) {
    const lead = allLeads.find((l) => l.id === leadId);
    setDraggingId(leadId);
    setDraggingStage(lead?.stage ?? null);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDraggingStage(null);
    setDragOverStage(null);
  }

  function handleDragOver(stage: string) {
    if (dragTimeout.current) clearTimeout(dragTimeout.current);
    setDragOverStage(stage);
  }

  function handleDragLeave() {
    dragTimeout.current = setTimeout(() => setDragOverStage(null), 50);
  }

  async function handleDrop(targetStage: string) {
    setDragOverStage(null);
    if (!draggingId || !draggingStage || draggingStage === targetStage) {
      setDraggingId(null);
      setDraggingStage(null);
      return;
    }
    const lead = allLeads.find((l) => l.id === draggingId);
    setDraggingId(null);
    setDraggingStage(null);

    try {
      await updateLead.mutateAsync({ id: draggingId, data: { stage: targetStage } });
      toast.success(`${lead?.name ?? 'Lead'} moved to ${PIPELINE_STAGES.find((s) => s.stage === targetStage)?.label ?? targetStage}`);
    } catch {
      toast.error('Failed to move lead');
    }
  }

  const totalShown = allLeads.length;
  const hasMore = data?.hasMore;

  return (
    <div className="space-y-2">
      {hasMore && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg inline-block">
          Showing first {totalShown} leads. Use filters or list view to see more.
        </p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((col) => (
          <KanbanColumn
            key={col.stage}
            stage={col.stage}
            label={col.label}
            topColor={col.topColor}
            leads={leadsByStage[col.stage] ?? []}
            dragOverStage={dragOverStage}
            draggingId={draggingId}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
    </div>
  );
}
