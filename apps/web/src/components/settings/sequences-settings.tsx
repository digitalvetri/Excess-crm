'use client';

import { useState } from 'react';
import { Workflow, Plus, Trash2, Loader2, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
  useSequences,
  useCreateSequence,
  useToggleSequence,
  useDeleteSequence,
  type SequenceTrigger,
  type StepChannel,
  type SequenceStepInput,
} from '@/hooks/use-sequences';

const LEAD_STAGES = ['NEW', 'QUALIFIED', 'FOLLOW_UP', 'CONVERTED', 'NOT_ANSWERED', 'INVALID', 'WRONG_ENQUIRY'];
const PROJECT_STAGES = ['SURVEY', 'DESIGN', 'MATERIAL_ORDERED', 'INSTALLATION', 'COMMISSIONING', 'HANDED_OVER'];

const TRIGGER_LABEL: Record<SequenceTrigger, string> = {
  LEAD_STAGE: 'Lead stage',
  PROJECT_STAGE: 'Project stage',
  MANUAL: 'Manual',
};

interface DraftStep {
  channel: StepChannel;
  delayHours: number;
  templateName: string;
  paramsRaw: string;
  subject: string;
  body: string;
}

function emptyStep(): DraftStep {
  return { channel: 'WHATSAPP', delayHours: 24, templateName: '', paramsRaw: '', subject: '', body: '' };
}

export function SequencesSettings() {
  const { data: sequences, isLoading } = useSequences();
  const create = useCreateSequence();
  const toggle = useToggleSequence();
  const del = useDeleteSequence();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<SequenceTrigger>('LEAD_STAGE');
  const [triggerValue, setTriggerValue] = useState('QUALIFIED');
  const [steps, setSteps] = useState<DraftStep[]>([emptyStep()]);

  function resetForm() {
    setShowForm(false);
    setName('');
    setTrigger('LEAD_STAGE');
    setTriggerValue('QUALIFIED');
    setSteps([emptyStep()]);
  }

  function updateStep(idx: number, patch: Partial<DraftStep>) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Sequence name is required');
      return;
    }
    if (steps.length === 0) {
      toast.error('Add at least one step');
      return;
    }

    const built: SequenceStepInput[] = [];
    for (const s of steps) {
      if (s.channel === 'WHATSAPP') {
        if (!s.templateName.trim()) {
          toast.error('Each WhatsApp step needs a template name');
          return;
        }
        const params: Record<string, string> = {};
        s.paramsRaw.split(',').map((p) => p.trim()).filter(Boolean).forEach((p, i) => {
          params[String(i + 1)] = p;
        });
        built.push({ channel: 'WHATSAPP', templateName: s.templateName.trim(), params, delayHours: s.delayHours });
      } else {
        if (!s.subject.trim() || !s.body.trim()) {
          toast.error('Each email step needs a subject and body');
          return;
        }
        built.push({
          channel: 'EMAIL',
          templateName: 'SEQUENCE_MESSAGE',
          params: { subject: s.subject.trim(), body: s.body.trim() },
          delayHours: s.delayHours,
        });
      }
    }

    try {
      await create.mutateAsync({
        name: name.trim(),
        trigger,
        ...(trigger !== 'MANUAL' && { triggerValue }),
        steps: built,
      });
      toast.success('Sequence created');
      resetForm();
    } catch {
      toast.error('Failed to create sequence');
    }
  }

  const stageOptions = trigger === 'PROJECT_STAGE' ? PROJECT_STAGES : LEAD_STAGES;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Drip Sequences</h1>
          <p className="text-sm text-slate-500 mt-1">
            Automate timed WhatsApp and email follow-ups when a lead or project reaches a stage.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} /> Add Sequence
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-slate-50 border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">New Sequence</h3>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Post-qualification nurture"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Trigger</label>
              <select
                value={trigger}
                onChange={(e) => {
                  const t = e.target.value as SequenceTrigger;
                  setTrigger(t);
                  setTriggerValue(t === 'PROJECT_STAGE' ? 'SURVEY' : 'QUALIFIED');
                }}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="LEAD_STAGE">When lead reaches stage</option>
                <option value="PROJECT_STAGE">When project reaches stage</option>
                <option value="MANUAL">Manual enrollment only</option>
              </select>
            </div>
            {trigger !== 'MANUAL' && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Stage</label>
                <select
                  value={triggerValue}
                  onChange={(e) => setTriggerValue(e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {stageOptions.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-600">Steps</p>
            {steps.map((step, idx) => (
              <div key={idx} className="bg-white border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Step {idx + 1}</span>
                  {steps.length > 1 && (
                    <button
                      onClick={() => setSteps((p) => p.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Channel</label>
                    <select
                      value={step.channel}
                      onChange={(e) => updateStep(idx, { channel: e.target.value as StepChannel })}
                      className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="WHATSAPP">WhatsApp</option>
                      <option value="EMAIL">Email</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Delay (hours)</label>
                    <input
                      type="number"
                      min={0}
                      value={step.delayHours}
                      onChange={(e) => updateStep(idx, { delayHours: Math.max(0, Number(e.target.value)) })}
                      className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                {step.channel === 'WHATSAPP' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Template name</label>
                      <input
                        value={step.templateName}
                        onChange={(e) => updateStep(idx, { templateName: e.target.value })}
                        placeholder="welcome_catalogue_v1"
                        className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Params (comma-separated)</label>
                      <input
                        value={step.paramsRaw}
                        onChange={(e) => updateStep(idx, { paramsRaw: e.target.value })}
                        placeholder="Value 1, Value 2"
                        className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Subject</label>
                      <input
                        value={step.subject}
                        onChange={(e) => updateStep(idx, { subject: e.target.value })}
                        className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Body</label>
                      <textarea
                        value={step.body}
                        onChange={(e) => updateStep(idx, { body: e.target.value })}
                        rows={3}
                        className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
            <button
              onClick={() => setSteps((p) => [...p, emptyStep()])}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Plus size={13} /> Add step
            </button>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => void handleSave()}
              disabled={create.isPending}
              className="flex items-center gap-1.5 text-sm bg-primary text-white px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {create.isPending && <Loader2 size={13} className="animate-spin" />}
              Save Sequence
            </button>
            <button onClick={resetForm} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-white rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : !sequences || sequences.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center">
          <Workflow size={24} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No sequences configured.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sequences.map((seq) => (
            <div
              key={seq.id}
              className={`bg-white rounded-xl border p-5 ${seq.isActive ? 'border-primary/20' : 'border-border opacity-60'}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Workflow size={15} className={seq.isActive ? 'text-primary' : 'text-slate-400'} />
                    <span className="font-semibold text-slate-800">{seq.name}</span>
                    {!seq.isActive && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <Clock size={12} />
                    {TRIGGER_LABEL[seq.trigger]}
                    {seq.triggerValue ? `: ${seq.triggerValue.replace(/_/g, ' ')}` : ''} ·{' '}
                    {seq._count.steps} step{seq._count.steps === 1 ? '' : 's'} · {seq._count.enrollments} enrolled
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => void toggle.mutateAsync({ id: seq.id, isActive: !seq.isActive })}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      seq.isActive ? 'bg-primary' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        seq.isActive ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await del.mutateAsync(seq.id);
                        toast.success('Sequence deleted');
                      } catch {
                        toast.error('Failed to delete');
                      }
                    }}
                    className="text-slate-400 hover:text-danger transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
