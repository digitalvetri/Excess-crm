'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, Save, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  useSavedReports,
  useRunReport,
  useSaveReport,
  useDeleteSavedReport,
  type ReportDimension,
  type ReportMetric,
  type ReportDefinition,
  type ReportResult,
} from '@/hooks/use-insights';

const DIMENSIONS: { value: ReportDimension; label: string }[] = [
  { value: 'stage', label: 'Stage' },
  { value: 'source', label: 'Source' },
  { value: 'team', label: 'Team' },
  { value: 'owner', label: 'Owner' },
  { value: 'city', label: 'City' },
  { value: 'month', label: 'Month' },
];

const METRICS: { value: ReportMetric; label: string }[] = [
  { value: 'count', label: 'Lead Count' },
  { value: 'conversionRate', label: 'Conversion %' },
  { value: 'avgAiScore', label: 'Avg AI Score' },
];

export default function ReportBuilderPage() {
  const [dimension, setDimension] = useState<ReportDimension>('source');
  const [metric, setMetric] = useState<ReportMetric>('count');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [result, setResult] = useState<ReportResult | null>(null);
  const [reportName, setReportName] = useState('');

  const run = useRunReport();
  const save = useSaveReport();
  const del = useDeleteSavedReport();
  const { data: saved = [] } = useSavedReports();

  function currentDefinition(): ReportDefinition {
    return {
      dimension,
      metric,
      ...(dateFrom && { dateFrom: new Date(dateFrom).toISOString() }),
      ...(dateTo && { dateTo: new Date(dateTo).toISOString() }),
    };
  }

  async function handleRun() {
    try {
      const res = await run.mutateAsync(currentDefinition());
      setResult(res);
    } catch {
      toast.error('Failed to run report');
    }
  }

  async function handleSave() {
    if (!reportName.trim()) {
      toast.error('Give the report a name');
      return;
    }
    try {
      await save.mutateAsync({ name: reportName.trim(), definition: currentDefinition() });
      toast.success('Report saved');
      setReportName('');
    } catch {
      toast.error('Failed to save report');
    }
  }

  function loadSaved(def: ReportDefinition) {
    setDimension(def.dimension);
    setMetric(def.metric);
    setDateFrom(def.dateFrom ? def.dateFrom.slice(0, 10) : '');
    setDateTo(def.dateTo ? def.dateTo.slice(0, 10) : '');
    setResult(null);
  }

  const metricLabel = METRICS.find((m) => m.value === metric)?.label ?? metric;

  return (
    <div className="space-y-6">
      <Link href="/insights" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={15} /> Back to Insights
      </Link>

      <div>
        <h1 className="text-xl font-bold text-slate-900">Report Builder</h1>
        <p className="text-sm text-slate-500 mt-1">Group leads by a dimension and pick a metric.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Builder controls */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-border p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Group by</label>
                <select
                  value={dimension}
                  onChange={(e) => setDimension(e.target.value as ReportDimension)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {DIMENSIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Metric</label>
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as ReportMetric)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {METRICS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">From (optional)</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">To (optional)</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleRun()}
                disabled={run.isPending}
                className="inline-flex items-center gap-1.5 text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {run.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Run Report
              </button>
              <input
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="Name to save…"
                className="flex-1 text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={() => void handleSave()}
                disabled={save.isPending}
                className="inline-flex items-center gap-1.5 text-sm border border-border text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <Save size={14} /> Save
              </button>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="bg-white rounded-xl border border-border p-5 space-y-4">
              {result.rows.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No data for this report.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={result.rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                        formatter={(v: number) => [v, metricLabel]}
                      />
                      <Bar dataKey="value" fill="#0F4C81" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-slate-500">
                        <th className="text-left px-3 py-2 font-medium">{result.dimension}</th>
                        <th className="text-right px-3 py-2 font-medium">{metricLabel}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((r) => (
                        <tr key={r.label} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 text-slate-700">{r.label.replace(/_/g, ' ')}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-800">
                            {r.value}
                            {metric === 'conversionRate' ? '%' : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </div>

        {/* Saved reports */}
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Saved Reports</h3>
          {saved.length === 0 ? (
            <p className="text-sm text-slate-400">No saved reports yet.</p>
          ) : (
            <div className="space-y-2">
              {saved.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-sm border-b border-border last:border-0 pb-2 last:pb-0">
                  <button
                    onClick={() => loadSaved(r.definition)}
                    className="text-left text-primary hover:underline truncate"
                  >
                    {r.name}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await del.mutateAsync(r.id);
                        toast.success('Deleted');
                      } catch {
                        toast.error('Failed to delete');
                      }
                    }}
                    className="text-slate-400 hover:text-danger shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
