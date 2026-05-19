'use client';

import { useState } from 'react';
import { Trash2, Plus, Loader2, GitBranch, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useRoutingRules,
  useCreateRoutingRule,
  useUpdateRoutingRule,
  useDeleteRoutingRule,
  useTeams,
} from '@/hooks/use-teams';

const SOURCE_TYPES = ['META', 'INDIAMART', 'JUSTDIAL', 'WEBSITE', 'WHATSAPP', 'MANUAL', 'PHONE_INBOUND'];

const SOURCE_LABELS: Record<string, string> = {
  META: 'Meta Ads', INDIAMART: 'IndiaMART', JUSTDIAL: 'JustDial',
  WEBSITE: 'Website', WHATSAPP: 'WhatsApp', MANUAL: 'Manual', PHONE_INBOUND: 'Missed Call',
};

interface RuleCondition {
  pincodes?: string[];
  cities?: string[];
  sourceTypes?: string[];
}

function conditionSummary(condition: Record<string, unknown>): string {
  const c = condition as RuleCondition;
  const parts: string[] = [];
  if (c.pincodes?.length) parts.push(`Pincodes: ${c.pincodes.join(', ')}`);
  if (c.cities?.length) parts.push(`Cities: ${c.cities.join(', ')}`);
  if (c.sourceTypes?.length) parts.push(`Sources: ${c.sourceTypes.map((s) => SOURCE_LABELS[s] ?? s).join(', ')}`);
  return parts.length ? parts.join(' · ') : 'All leads (catch-all)';
}

function TagInput({ value, onChange, placeholder }: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState('');

  function add() {
    const v = input.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setInput('');
  }

  return (
    <div className="flex flex-wrap gap-1 items-center border border-border rounded-lg px-2 py-1.5 min-h-[38px]">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-0.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
          {v}
          <button onClick={() => onChange(value.filter((x) => x !== v))}><X size={9} /></button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] text-xs outline-none bg-transparent"
      />
    </div>
  );
}

export function AssignmentRulesSettings() {
  const { data: rules, isLoading } = useRoutingRules();
  const { data: teams } = useTeams();
  const createRule = useCreateRoutingRule();
  const updateRule = useUpdateRoutingRule();
  const deleteRule = useDeleteRoutingRule();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    priority: 1,
    targetTeamId: '',
    pincodes: [] as string[],
    cities: [] as string[],
    sourceTypes: [] as string[],
  });

  async function handleCreate() {
    if (!form.targetTeamId) {
      toast.error('Select a target team');
      return;
    }
    const condition: Record<string, unknown> = {};
    if (form.pincodes.length) condition.pincodes = form.pincodes;
    if (form.cities.length) condition.cities = form.cities;
    if (form.sourceTypes.length) condition.sourceTypes = form.sourceTypes;

    try {
      await createRule.mutateAsync({
        priority: form.priority,
        targetTeamId: form.targetTeamId,
        condition,
      });
      toast.success('Assignment rule created');
      setShowForm(false);
      setForm({ priority: 1, targetTeamId: '', pincodes: [], cities: [], sourceTypes: [] });
    } catch {
      toast.error('Failed to create rule');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Assignment Rules</h1>
          <p className="text-sm text-slate-500 mt-1">
            Auto-assign incoming leads to teams using round-robin.
            Rules are evaluated in priority order — first match wins.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} /> Add Rule
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-50 border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">New Assignment Rule</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Priority (lower = higher priority)</label>
              <input
                type="number"
                min={1}
                max={999}
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 1 }))}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Assign to Team (round-robin)</label>
              <select
                value={form.targetTeamId}
                onChange={(e) => setForm((f) => ({ ...f, targetTeamId: e.target.value }))}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                <option value="">Select team...</option>
                {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Match Pincodes (leave empty = any)</label>
              <TagInput
                value={form.pincodes}
                onChange={(v) => setForm((f) => ({ ...f, pincodes: v }))}
                placeholder="641001, 641002..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Match Cities</label>
              <TagInput
                value={form.cities}
                onChange={(v) => setForm((f) => ({ ...f, cities: v }))}
                placeholder="Coimbatore, Chennai..."
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Match Source Types</label>
              <div className="flex flex-wrap gap-2">
                {SOURCE_TYPES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setForm((f) => ({
                      ...f,
                      sourceTypes: f.sourceTypes.includes(s)
                        ? f.sourceTypes.filter((x) => x !== s)
                        : [...f.sourceTypes, s],
                    }))}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      form.sourceTypes.includes(s)
                        ? 'bg-primary text-white border-primary'
                        : 'text-slate-600 border-slate-200 hover:border-primary/50'
                    }`}
                  >
                    {SOURCE_LABELS[s] ?? s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => void handleCreate()}
              disabled={createRule.isPending || !form.targetTeamId}
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

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white rounded-xl border border-border animate-pulse" />)}
        </div>
      ) : !rules || rules.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center">
          <GitBranch size={24} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No assignment rules yet.</p>
          <p className="text-xs text-slate-400 mt-1">New leads will be unassigned until rules are configured.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                <th className="text-center px-4 py-3 font-semibold text-slate-600 w-16">Priority</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Condition</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Team</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600 w-20">Active</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {[...rules].sort((a, b) => a.priority - b.priority).map((rule) => (
                <tr key={rule.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                      {rule.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs max-w-xs">
                    {conditionSummary(rule.condition)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {rule.targetTeam.name}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => void updateRule.mutateAsync({ id: rule.id, isActive: !rule.isActive })}
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
