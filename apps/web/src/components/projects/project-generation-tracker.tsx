'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { SunMedium, Plus, Trash2, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAddGeneration,
  useDeleteGeneration,
  type GenerationReading,
} from '@/hooks/use-projects';

function monthLabel(m: string): string {
  const [y, mo] = m.split('-');
  return format(new Date(Number(y), Number(mo) - 1, 1), 'MMM yy');
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ProjectGenerationTracker({
  projectId,
  generationLog,
  isPostCommission,
}: {
  projectId: string;
  generationLog: GenerationReading[];
  isPostCommission: boolean;
}) {
  const addGen    = useAddGeneration();
  const deleteGen = useDeleteGeneration();

  const [month, setMonth]   = useState(() => new Date().toISOString().slice(0, 7));
  const [kwh, setKwh]       = useState('');
  const [showForm, setShowForm] = useState(false);
  const [confirmMonth, setConfirmMonth] = useState<string | null>(null);

  const sorted = [...generationLog].sort((a, b) => a.month.localeCompare(b.month));
  const totalKwh   = sorted.reduce((s, r) => s + r.kwhGenerated, 0);
  const avgMonthly = sorted.length > 0 ? totalKwh / sorted.length : 0;
  const bestMonth  = sorted.reduce<GenerationReading | null>(
    (best, r) => (!best || r.kwhGenerated > best.kwhGenerated ? r : best),
    null,
  );

  const chartData = sorted.slice(-18).map((r) => ({
    month: monthLabel(r.month),
    kwh: r.kwhGenerated,
  }));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(kwh);
    if (!month || isNaN(val) || val < 0) { toast.error('Enter a valid reading'); return; }
    try {
      await addGen.mutateAsync({ id: projectId, month, kwhGenerated: val });
      toast.success('Reading saved');
      setKwh('');
      setShowForm(false);
    } catch {
      toast.error('Failed to save reading');
    }
  }

  async function handleDelete(m: string) {
    if (confirmMonth !== m) { setConfirmMonth(m); return; }
    try {
      await deleteGen.mutateAsync({ id: projectId, month: m });
      toast.success('Reading removed');
    } catch {
      toast.error('Failed to remove reading');
    } finally {
      setConfirmMonth(null);
    }
  }

  if (!isPostCommission) {
    return (
      <div className="rounded-2xl border border-border bg-white p-5 flex flex-col items-center justify-center py-10 text-center">
        <SunMedium size={28} className="text-slate-200 mb-2" />
        <p className="text-sm text-slate-400">Generation tracking available after commissioning</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <SunMedium size={15} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-700">Generation Log</h3>
          {sorted.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              {sorted.length} month{sorted.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
            showForm ? 'bg-slate-100 text-slate-600' : 'bg-primary text-white hover:bg-primary/90'
          }`}
        >
          {showForm ? <X size={13} /> : <Plus size={13} />}
          {showForm ? 'Cancel' : 'Add Reading'}
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Add form */}
        {showForm && (
          <form
            onSubmit={(e) => void handleAdd(e)}
            className="flex gap-3 flex-wrap items-end rounded-xl border border-primary/20 bg-primary/3 p-4"
          >
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                required
                className="rounded-lg border border-border bg-white py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Units generated (kWh)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={kwh}
                onChange={(e) => setKwh(e.target.value)}
                placeholder="e.g. 620"
                required
                className="w-36 rounded-lg border border-border bg-white py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <button
              type="submit"
              disabled={addGen.isPending}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {addGen.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Save
            </button>
          </form>
        )}

        {/* Empty state */}
        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
            <SunMedium size={24} className="text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">No generation readings yet</p>
            <p className="text-xs text-slate-300 mt-0.5">Add your first monthly kWh reading to start tracking</p>
          </div>
        )}

        {/* KPI strip */}
        {sorted.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <StatChip
              label="Total Generated"
              value={`${totalKwh.toLocaleString('en-IN')} kWh`}
              sub={`across ${sorted.length} months`}
            />
            <StatChip
              label="Monthly Average"
              value={`${Math.round(avgMonthly).toLocaleString('en-IN')} kWh`}
              sub="per month"
            />
            {bestMonth && (
              <StatChip
                label="Best Month"
                value={`${bestMonth.kwhGenerated.toLocaleString('en-IN')} kWh`}
                sub={monthLabel(bestMonth.month)}
              />
            )}
          </div>
        )}

        {/* Bar chart */}
        {chartData.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Monthly Generation (kWh){chartData.length < sorted.length ? ' — last 18 months' : ''}
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: 12 }}
                  formatter={(v: number) => [`${v.toLocaleString('en-IN')} kWh`, 'Generated']}
                />
                <Bar dataKey="kwh" fill="#0F4C81" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Reading table */}
        {sorted.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">All Readings</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-1">
              {[...sorted].reverse().map((r) => (
                <div
                  key={r.month}
                  className="group flex items-center justify-between rounded-xl border border-border bg-white px-3.5 py-2.5 hover:border-slate-300 transition-colors"
                >
                  <div>
                    <span className="text-sm font-semibold text-slate-800">{monthLabel(r.month)}</span>
                    <span className="ml-3 text-sm text-slate-500">{r.kwhGenerated.toLocaleString('en-IN')} kWh</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-300">
                      {format(new Date(r.recordedAt), 'd MMM yyyy')}
                    </span>
                    {confirmMonth === r.month ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-danger">Remove?</span>
                        <button
                          onClick={() => void handleDelete(r.month)}
                          disabled={deleteGen.isPending}
                          className="rounded-lg bg-danger px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-danger/90 disabled:opacity-50"
                        >
                          {deleteGen.isPending ? <Loader2 size={10} className="animate-spin" /> : 'Yes'}
                        </button>
                        <button onClick={() => setConfirmMonth(null)} className="text-slate-400 hover:text-slate-600">
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => void handleDelete(r.month)}
                        className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-200 hover:bg-red-50 hover:text-danger transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatChip({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-[11px] text-slate-400 font-medium mb-1">{label}</div>
      <div className="text-sm font-bold text-slate-800">{value}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}
