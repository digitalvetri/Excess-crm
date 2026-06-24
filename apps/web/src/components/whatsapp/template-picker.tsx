'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, X } from 'lucide-react';
import { useWhatsappTemplates, useSendTemplate, type WaTemplate } from '@/hooks/use-whatsapp';

export function templateVars(previewText: string): string[] {
  const found = previewText.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(found.map((m) => m.replace(/[{}]/g, '')))];
}

// Approved-template picker — lets agents re-engage a lead outside the 24-hour window.
// Renders as an overlay; the parent container must be `relative`.
export function TemplatePicker({
  leadId,
  leadName,
  onClose,
  onSent,
}: {
  leadId: string;
  leadName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { data: templates = [], isLoading } = useWhatsappTemplates();
  const { sendTemplate, sending } = useSendTemplate();
  const [selected, setSelected] = useState<WaTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  function pick(t: WaTemplate) {
    setSelected(t);
    const initial: Record<string, string> = {};
    templateVars(t.previewText).forEach((v) => (initial[v] = v === 'name' ? leadName : ''));
    setValues(initial);
  }

  const vars = selected ? templateVars(selected.previewText) : [];
  const filledPreview = selected
    ? selected.previewText.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] || `{{${k}}}`)
    : '';
  const ready = vars.every((v) => (values[v] ?? '').trim().length > 0);

  async function handleSend() {
    if (!selected || !ready) return;
    try {
      await sendTemplate(leadId, selected.templateName, filledPreview, values);
      toast.success('Template sent');
      onSent();
      onClose();
    } catch {
      toast.error('Could not send template');
    }
  }

  return (
    <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/20" onClick={onClose}>
      <div
        className="w-full max-h-[80%] overflow-y-auto rounded-t-2xl border border-border bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          {selected ? (
            <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-800">
              <ChevronLeft size={16} />
            </button>
          ) : null}
          <h3 className="text-sm font-semibold text-slate-800">
            {selected ? selected.name : 'Choose a template'}
          </h3>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>

        {!selected ? (
          isLoading ? (
            <p className="py-6 text-center text-sm text-slate-400">Loading templates…</p>
          ) : templates.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No templates available.</p>
          ) : (
            <div className="space-y-1.5">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pick(t)}
                  className="w-full rounded-lg border border-border p-3 text-left hover:border-primary/40 transition-colors"
                >
                  <div className="text-sm font-medium text-slate-800">{t.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500 line-clamp-2">{t.previewText}</div>
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-3">
            {vars.map((v) => (
              <div key={v}>
                <label className="text-xs font-medium capitalize text-slate-600">{v.replace('_', ' ')}</label>
                <input
                  type="text"
                  value={values[v] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            ))}
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{filledPreview}</div>
            <button
              onClick={() => void handleSend()}
              disabled={!ready || sending}
              className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {sending ? 'Sending…' : 'Send template'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
