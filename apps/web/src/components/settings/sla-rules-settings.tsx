'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useUsers } from '@/hooks/use-teams';

interface SlaRule {
  id: string;
  stage: string;
  thresholdHours: number;
  action: 'NOTIFY' | 'REASSIGN';
  notifyUserId: string | null;
  isActive: boolean;
  createdAt: string;
}

const STAGES = ['NEW', 'QUALIFIED', 'FOLLOW_UP', 'NOT_ANSWERED'];

const ACTION_LABELS: Record<string, string> = {
  NOTIFY: 'Add alert to activity feed',
  REASSIGN: 'Reassign lead to user',
};

function usesSlaRules() {
  return useQuery({
    queryKey: ['sla-rules'],
    queryFn: () => api.get<{ data: SlaRule[] }>('/sla-rules').then((r) => r.data.data),
  });
}

function useCreateSlaRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<SlaRule, 'id' | 'createdAt'>) =>
      api.post<{ data: SlaRule }>('/sla-rules', data).then((r) => r.data.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sla-rules'] }),
  });
}

function useDeleteSlaRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sla-rules/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sla-rules'] }),
  });
}

function useToggleSlaRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/sla-rules/${id}`, { isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sla-rules'] }),
  });
}

export function SlaRulesSettings() {
  const { data: rules, isLoading } = usesSlaRules();
  const { data: users } = useUsers();
  const createRule = useCreateSlaRule();
  const deleteRule = useDeleteSlaRule();
  const toggleRule = useToggleSlaRule();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    stage: 'NEW',
    thresholdHours: 24,
    action: 'NOTIFY' as 'NOTIFY' | 'REASSIGN',
    notifyUserId: '',
    isActive: true,
  });

  async function handleCreate() {
    if (form.action === 'REASSIGN' && !form.notifyUserId) {
      toast.error('Select a user to reassign leads to');
      return;
    }
    try {
      await createRule.mutateAsync({
        stage: form.stage,
        thresholdHours: form.thresholdHours,
        action: form.action,
        notifyUserId: form.notifyUserId || null,
        isActive: true,
      });
      toast.success('SLA rule created');
      setShowForm(false);
      setForm({ stage: 'NEW', thresholdHours: 24, action: 'NOTIFY', notifyUserId: '', isActive: true });
    } catch {
      toast.error('Failed to create rule');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">SLA Rules</h1>
          <p className="text-sm text-slate-500 mt-1">
            Auto-escalate leads that stay in a stage longer than the threshold.
            Checked hourly.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} /> Add Rule
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-slate-50 border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">New SLA Rule</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Stage</label>
              <select
                value={form.stage}
                onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                {STAGES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Threshold (hours)</label>
              <input
                type="number"
                min={1}
                max={720}
                value={form.thresholdHours}
                onChange={(e) => setForm((f) => ({ ...f, thresholdHours: parseInt(e.target.value) || 24 }))}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Action</label>
              <select
                value={form.action}
                onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as 'NOTIFY' | 'REASSIGN' }))}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                <option value="NOTIFY">{ACTION_LABELS.NOTIFY}</option>
                <option value="REASSIGN">{ACTION_LABELS.REASSIGN}</option>
              </select>
            </div>

            {form.action === 'REASSIGN' && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Reassign to</label>
                <select
                  value={form.notifyUserId}
                  onChange={(e) => setForm((f) => ({ ...f, notifyUserId: e.target.value }))}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="">Select user...</option>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role.replace('_', ' ')})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => void handleCreate()}
              disabled={createRule.isPending}
              className="flex items-center gap-1.5 text-sm bg-primary text-white px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {createRule.isPending && <Loader2 size={13} className="animate-spin" />}
              Save Rule
            </button>
            <button onClick={() => setShowForm(false)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-16 bg-white rounded-xl border border-border animate-pulse" />)}
        </div>
      ) : !rules || rules.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center">
          <AlertTriangle size={24} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No SLA rules configured yet.</p>
          <p className="text-xs text-slate-400 mt-1">Add rules to automatically escalate stale leads.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Stage</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Threshold</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Action</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Active</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-xs">
                      {rule.stage.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {rule.thresholdHours >= 24
                      ? `${rule.thresholdHours / 24}d`
                      : `${rule.thresholdHours}h`}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                      rule.action === 'NOTIFY' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {rule.action === 'NOTIFY' ? 'Alert' : 'Reassign'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => void toggleRule.mutateAsync({ id: rule.id, isActive: !rule.isActive })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        rule.isActive ? 'bg-primary' : 'bg-slate-200'
                      }`}
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        rule.isActive ? 'translate-x-5' : 'translate-x-1'
                      }`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={async () => {
                        try { await deleteRule.mutateAsync(rule.id); toast.success('Rule deleted'); }
                        catch { toast.error('Failed to delete rule'); }
                      }}
                      className="text-slate-400 hover:text-danger transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
