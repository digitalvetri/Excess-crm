'use client';

import { useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

const ISSUE_TYPES = [
  { value: 'GENERAL',    label: 'General Query' },
  { value: 'COMPLAINT',  label: 'Complaint' },
  { value: 'AMC_VISIT',  label: 'AMC / Service Visit' },
  { value: 'WARRANTY',   label: 'Warranty Issue' },
] as const;

export function IssueForm({ token }: { token: string }) {
  const [subject, setSubject]   = useState('');
  const [type, setType]         = useState<string>('GENERAL');
  const [description, setDesc]  = useState('');
  const [submitting, setSubmit] = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;
    setSubmit(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/portal/project/${token}/ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), type, description: description.trim() || undefined }),
      });
      if (!res.ok) throw new Error('Request failed');
      setDone(true);
    } catch {
      setError('Could not submit. Please try again or call us directly.');
    } finally {
      setSubmit(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 py-3 text-green-700">
        <CheckCircle2 size={16} className="shrink-0" />
        <p className="text-sm">Your request has been submitted. Our team will contact you shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mt-2">
      <div>
        <label className="block text-xs text-slate-500 mb-1">Issue Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]"
        >
          {ISSUE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">Subject <span className="text-red-400">*</span></label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Inverter not working"
          required
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">Details (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Describe the issue..."
          rows={3}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F4C81] resize-none"
        />
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-red-600 text-xs">
          <AlertTriangle size={13} />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !subject.trim()}
        className="w-full rounded-lg bg-[#0F4C81] py-2.5 text-sm font-semibold text-white transition hover:bg-[#0a3a6b] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        Submit Request
      </button>
    </form>
  );
}
