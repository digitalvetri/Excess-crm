'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, Loader2, Shield, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface StageGate {
  id: string;
  stage: string;
  requiredFields: string[];
  requiredActivityTypes: string[];
  isActive: boolean;
  createdAt: string;
}

const STAGES = ['QUALIFIED', 'FOLLOW_UP', 'CONVERTED', 'NOT_ANSWERED', 'INVALID', 'WRONG_ENQUIRY'];

const FIELD_OPTIONS = [
  { key: 'email', label: 'Email address' },
  { key: 'city', label: 'City' },
  { key: 'pincode', label: 'Pincode' },
  { key: 'factSheet', label: 'Fact sheet filled' },
];

const ACTIVITY_OPTIONS = [
  { key: 'CALL', label: 'At least one call' },
  { key: 'NOTE', label: 'A note added' },
  { key: 'APPOINTMENT_BOOKED', label: 'Appointment booked' },
  { key: 'QUOTATION_SENT', label: 'Quotation sent' },
];

function useStageGates() {
  return useQuery({
    queryKey: ['stage-gates'],
    queryFn: () => api.get<{ data: StageGate[] }>('/stage-gates').then((r) => r.data.data),
  });
}

function useUpsertStageGate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<StageGate, 'id' | 'createdAt'>) =>
      api.post<{ data: StageGate }>('/stage-gates', data).then((r) => r.data.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stage-gates'] }),
  });
}

function useToggleStageGate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/stage-gates/${id}`, { isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stage-gates'] }),
  });
}

function useDeleteStageGate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/stage-gates/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stage-gates'] }),
  });
}

export function StageGatesSettings() {
  const { data: gates, isLoading } = useStageGates();
  const upsert = useUpsertStageGate();
  const toggle = useToggleStageGate();
  const del = useDeleteStageGate();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    stage: 'QUALIFIED',
    requiredFields: [] as string[],
    requiredActivityTypes: [] as string[],
  });

  function toggle2Array<T>(arr: T[], item: T): T[] {
    return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
  }

  async function handleSave() {
    if (!form.requiredFields.length && !form.requiredActivityTypes.length) {
      toast.error('Add at least one required field or activity');
      return;
    }
    try {
      await upsert.mutateAsync({
        stage: form.stage,
        requiredFields: form.requiredFields,
        requiredActivityTypes: form.requiredActivityTypes,
        isActive: true,
      });
      toast.success('Stage gate saved');
      setShowForm(false);
      setForm({ stage: 'QUALIFIED', requiredFields: [], requiredActivityTypes: [] });
    } catch {
      toast.error('Failed to save stage gate');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Stage Gates</h1>
          <p className="text-sm text-slate-500 mt-1">
            Require specific fields or activities before a lead can move to a new stage.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} /> Add Gate
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-50 border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">New Stage Gate</h3>
          <p className="text-xs text-slate-500">
            Define what must be true before a lead can enter this stage.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Gate for stage (entry requirements)</label>
            <select
              value={form.stage}
              onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              {STAGES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">Required fields (must be filled)</label>
            <div className="flex flex-wrap gap-2">
              {FIELD_OPTIONS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setForm((prev) => ({ ...prev, requiredFields: toggle2Array(prev.requiredFields, f.key) }))}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    form.requiredFields.includes(f.key)
                      ? 'bg-primary text-white border-primary'
                      : 'text-slate-600 border-slate-200 hover:border-primary/50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">Required activities (must exist)</label>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_OPTIONS.map((a) => (
                <button
                  key={a.key}
                  onClick={() => setForm((prev) => ({ ...prev, requiredActivityTypes: toggle2Array(prev.requiredActivityTypes, a.key) }))}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    form.requiredActivityTypes.includes(a.key)
                      ? 'bg-primary text-white border-primary'
                      : 'text-slate-600 border-slate-200 hover:border-primary/50'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => void handleSave()}
              disabled={upsert.isPending}
              className="flex items-center gap-1.5 text-sm bg-primary text-white px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {upsert.isPending && <Loader2 size={13} className="animate-spin" />}
              Save Gate
            </button>
            <button onClick={() => setShowForm(false)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-20 bg-white rounded-xl border border-border animate-pulse" />)}
        </div>
      ) : !gates || gates.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center">
          <Shield size={24} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No stage gates configured.</p>
          <p className="text-xs text-slate-400 mt-1">Leads can move freely between stages.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {gates.map((gate) => (
            <div key={gate.id} className={`bg-white rounded-xl border p-5 ${gate.isActive ? 'border-primary/20' : 'border-border opacity-60'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Shield size={15} className={gate.isActive ? 'text-primary' : 'text-slate-400'} />
                  <span className="font-semibold text-slate-800">
                    → {gate.stage.replace(/_/g, ' ')}
                  </span>
                  {!gate.isActive && (
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">Disabled</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => void toggle.mutateAsync({ id: gate.id, isActive: !gate.isActive })}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      gate.isActive ? 'bg-primary' : 'bg-slate-200'
                    }`}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      gate.isActive ? 'translate-x-5' : 'translate-x-1'
                    }`} />
                  </button>
                  <button
                    onClick={async () => {
                      try { await del.mutateAsync(gate.id); toast.success('Gate deleted'); }
                      catch { toast.error('Failed to delete gate'); }
                    }}
                    className="text-slate-400 hover:text-danger transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                {gate.requiredFields.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-slate-400 shrink-0 mt-0.5">Required fields:</span>
                    <div className="flex flex-wrap gap-1">
                      {gate.requiredFields.map((f) => (
                        <span key={f} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-full">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
                {gate.requiredActivityTypes.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-slate-400 shrink-0 mt-0.5">Required activities:</span>
                    <div className="flex flex-wrap gap-1">
                      {gate.requiredActivityTypes.map((a) => (
                        <span key={a} className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">{a.replace(/_/g, ' ')}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
