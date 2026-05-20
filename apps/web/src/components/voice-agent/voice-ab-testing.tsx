'use client';

import { useState, useEffect } from 'react';
import { FlaskConical, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAbConfig,
  useAbResults,
  useUpdateAbConfig,
  AB_PERSONAS,
  PERSONA_LABEL,
} from '@/hooks/use-voice-ab';

export function VoiceAbTesting() {
  const { data: config, isLoading } = useAbConfig();
  const { data: results = [] } = useAbResults();
  const update = useUpdateAbConfig();

  const [draft, setDraft] = useState<Record<string, number>>({});

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  async function handleSave() {
    try {
      await update.mutateAsync(draft);
      toast.success('A/B split saved');
    } catch {
      toast.error('Failed to save A/B config');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FlaskConical size={18} className="text-primary" />
        <h2 className="text-lg font-semibold text-slate-800">Prompt A/B Testing</h2>
      </div>
      <p className="text-sm text-slate-500">
        Route a percentage of each persona&apos;s calls to a B-variant assistant. The B variant must
        be configured in Vapi and its ID set via <code className="text-xs">VAPI_ASSISTANT_ID_*_B</code>.
      </p>

      {isLoading ? (
        <div className="h-32 bg-white rounded-xl border border-border animate-pulse" />
      ) : (
        <div className="bg-white rounded-xl border border-border p-5 space-y-4">
          {AB_PERSONAS.map((persona) => {
            const value = draft[persona] ?? 0;
            return (
              <div key={persona} className="flex items-center gap-4">
                <span className="text-sm text-slate-700 w-44 shrink-0">{PERSONA_LABEL[persona]}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={value}
                  onChange={(e) => setDraft((d) => ({ ...d, [persona]: Number(e.target.value) }))}
                  className="flex-1 accent-primary"
                />
                <span className="text-sm font-medium text-slate-800 w-28 text-right">
                  {value}% to B
                </span>
              </div>
            );
          })}
          <button
            onClick={() => void handleSave()}
            disabled={update.isPending}
            className="inline-flex items-center gap-1.5 text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {update.isPending && <Loader2 size={14} className="animate-spin" />}
            Save A/B Split
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-slate-50">
          <p className="text-sm font-semibold text-slate-700">Variant Comparison</p>
        </div>
        {results.length === 0 ? (
          <p className="text-sm text-slate-400 px-4 py-6 text-center">
            No A/B calls recorded yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-slate-500">
                <th className="text-left px-4 py-2 font-medium">Persona</th>
                <th className="text-center px-4 py-2 font-medium">Variant</th>
                <th className="text-right px-4 py-2 font-medium">Calls</th>
                <th className="text-right px-4 py-2 font-medium">Connect Rate</th>
                <th className="text-right px-4 py-2 font-medium">Avg Duration</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={`${r.persona}-${r.variant}`} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-slate-700">{r.persona.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                        r.variant === 'B' ? 'bg-accent/15 text-accent' : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {r.variant}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.calls}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{r.connectRate}%</td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {Math.floor(r.avgDurationSec / 60)}m {r.avgDurationSec % 60}s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
