'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import {
  PROJECT_STAGES,
  STAGE_LABEL,
  useUpdateChecklist,
  type ProjectStage,
  type StageChecklists,
} from '@/hooks/use-projects';

// ── Default checklist items (stable IDs so saved state aligns) ───────────────
export const DEFAULT_CHECKLIST: Record<ProjectStage, { id: string; label: string }[]> = {
  SURVEY: [
    { id: 'sv-1', label: 'Site visit completed' },
    { id: 'sv-2', label: 'Roof condition & area measured' },
    { id: 'sv-3', label: 'Measurement sheet filled' },
    { id: 'sv-4', label: 'Shadow analysis performed' },
    { id: 'sv-5', label: 'Existing load & meter details collected' },
    { id: 'sv-6', label: 'Site photos captured' },
  ],
  DESIGN: [
    { id: 'ds-1', label: 'Panel layout design prepared' },
    { id: 'ds-2', label: 'Single-line diagram (SLD) drawn' },
    { id: 'ds-3', label: 'Panel brand & model finalised' },
    { id: 'ds-4', label: 'Inverter model selected' },
    { id: 'ds-5', label: 'Customer design approval obtained' },
    { id: 'ds-6', label: 'Work order signed by customer' },
  ],
  MATERIAL_ORDERED: [
    { id: 'mo-1', label: 'Purchase order raised' },
    { id: 'mo-2', label: 'Panels dispatched from supplier' },
    { id: 'mo-3', label: 'Inverter dispatched' },
    { id: 'mo-4', label: 'Mounting structure ordered' },
    { id: 'mo-5', label: 'BOS & AC materials procured' },
    { id: 'mo-6', label: 'All materials received at site' },
  ],
  INSTALLATION: [
    { id: 'in-1', label: 'Mounting structure erected' },
    { id: 'in-2', label: 'Solar panels installed' },
    { id: 'in-3', label: 'DC wiring completed' },
    { id: 'in-4', label: 'Inverter installed & connected' },
    { id: 'in-5', label: 'AC wiring & DB work done' },
    { id: 'in-6', label: 'Earthing & bonding completed' },
    { id: 'in-7', label: 'Lightning arrestor installed' },
  ],
  COMMISSIONING: [
    { id: 'cm-1', label: 'System powered on and tested' },
    { id: 'cm-2', label: 'Generation monitored for 24h' },
    { id: 'cm-3', label: 'Net metering application filed with DISCOM' },
    { id: 'cm-4', label: 'DISCOM inspection cleared' },
    { id: 'cm-5', label: 'Bi-directional meter installed' },
    { id: 'cm-6', label: 'Grid synchronisation confirmed' },
    { id: 'cm-7', label: 'Commissioning certificate obtained' },
  ],
  HANDED_OVER: [
    { id: 'ho-1', label: 'Handover document signed by customer' },
    { id: 'ho-2', label: 'System operation training given' },
    { id: 'ho-3', label: 'Panel & inverter warranty cards issued' },
    { id: 'ho-4', label: 'AMC agreement signed (if applicable)' },
    { id: 'ho-5', label: 'Final payment collected' },
    { id: 'ho-6', label: 'Customer satisfaction confirmed' },
  ],
};

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  doneAt?: string;
}

function mergeChecklist(stage: ProjectStage, saved: StageChecklists): ChecklistItem[] {
  const defaults = DEFAULT_CHECKLIST[stage];
  const savedItems = (saved[stage] ?? []) as ChecklistItem[];
  const savedMap = new Map(savedItems.map((i) => [i.id, i]));
  return defaults.map((d) => {
    const s = savedMap.get(d.id);
    const item: ChecklistItem = { ...d, done: s?.done ?? false };
    if (s?.doneAt) item.doneAt = s.doneAt;
    return item;
  });
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ProjectChecklist({
  projectId,
  currentStage,
  stageChecklists,
}: {
  projectId: string;
  currentStage: ProjectStage;
  stageChecklists: StageChecklists;
}) {
  const updateChecklist = useUpdateChecklist();
  const [expanded, setExpanded] = useState<ProjectStage>(currentStage);
  const [pending, setPending] = useState<string | null>(null);

  async function toggle(stage: ProjectStage, item: ChecklistItem, done: boolean) {
    setPending(item.id);
    try {
      await updateChecklist.mutateAsync({ id: projectId, stage, itemId: item.id, label: item.label, done });
    } catch {
      toast.error('Failed to update checklist');
    } finally {
      setPending(null);
    }
  }

  const currentIdx = PROJECT_STAGES.indexOf(currentStage);

  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
        <ClipboardList size={15} className="text-primary" />
        <h3 className="text-sm font-semibold text-slate-700">Stage Checklists</h3>
      </div>

      <div className="divide-y divide-border">
        {PROJECT_STAGES.map((stage, idx) => {
          const items      = mergeChecklist(stage, stageChecklists);
          const doneCount  = items.filter((i) => i.done).length;
          const total      = items.length;
          const allDone    = doneCount === total;
          const isPast     = idx < currentIdx;
          const isCurrent  = idx === currentIdx;
          const isFuture   = idx > currentIdx;
          const isOpen     = expanded === stage;

          return (
            <div key={stage}>
              {/* Stage header */}
              <button
                onClick={() => setExpanded(isOpen ? ('' as ProjectStage) : stage)}
                className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50 ${
                  isCurrent ? 'bg-primary/4' : ''
                }`}
              >
                {/* Status dot */}
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    allDone && !isFuture
                      ? 'bg-success text-white'
                      : isCurrent
                      ? 'bg-primary text-white'
                      : isPast
                      ? 'bg-slate-300 text-white'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {allDone && !isFuture ? <Check size={11} /> : idx + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${isCurrent ? 'text-primary' : isFuture ? 'text-slate-300' : 'text-slate-700'}`}>
                      {STAGE_LABEL[stage]}
                    </span>
                    {isCurrent && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        Current
                      </span>
                    )}
                  </div>
                  {!isFuture && (
                    <div className="mt-0.5 flex items-center gap-2">
                      <div className="h-1 w-20 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${allDone ? 'bg-success' : 'bg-primary'}`}
                          style={{ width: `${(doneCount / total) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {doneCount}/{total}
                      </span>
                    </div>
                  )}
                </div>

                {isOpen ? (
                  <ChevronDown size={14} className="text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight size={14} className="text-slate-400 shrink-0" />
                )}
              </button>

              {/* Items */}
              {isOpen && (
                <div className="bg-slate-50/50 px-5 pb-3 pt-1 space-y-0.5">
                  {items.map((item) => {
                    const isDisabled = isFuture || pending === item.id;
                    return (
                      <button
                        key={item.id}
                        disabled={isDisabled}
                        onClick={() => void toggle(stage, item, !item.done)}
                        className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                          isDisabled
                            ? 'cursor-not-allowed opacity-50'
                            : 'hover:bg-white hover:shadow-sm'
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
                            item.done
                              ? 'border-success bg-success'
                              : 'border-slate-300 bg-white'
                          }`}
                          style={{ height: '1.125rem', width: '1.125rem' }}
                        >
                          {item.done && <Check size={10} className="text-white" strokeWidth={3} />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm ${item.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                            {item.label}
                          </span>
                          {item.done && item.doneAt && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {new Date(item.doneAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
