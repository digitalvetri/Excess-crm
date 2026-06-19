'use client';

import { use, useEffect, useState } from 'react';
import { Sun, Loader2, CheckCircle2 } from 'lucide-react';

const SCORE_COLORS: Record<string, string> = {
  detractor: 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100',
  passive:   'border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100',
  promoter:  'border-green-400 bg-green-50 text-green-700 hover:bg-green-100',
};

function scoreCategory(n: number): 'detractor' | 'passive' | 'promoter' {
  if (n <= 6) return 'detractor';
  if (n <= 8) return 'passive';
  return 'promoter';
}

export default function NpsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [loading, setLoading]               = useState(true);
  const [alreadyResponded, setAlreadyResponded] = useState(false);
  const [selected, setSelected]             = useState<number | null>(null);
  const [comment, setComment]               = useState('');
  const [submitting, setSubmitting]         = useState(false);
  const [done, setDone]                     = useState(false);
  const [error, setError]                   = useState('');

  useEffect(() => {
    fetch(`/api/v1/portal/nps/${token}`)
      .then((r) => r.json())
      .then((body: { data?: { alreadyResponded: boolean } }) => {
        if (body.data?.alreadyResponded) setAlreadyResponded(true);
      })
      .catch(() => {/* show form anyway */})
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit() {
    if (selected === null) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/portal/nps/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npsScore: selected, npsComment: comment || undefined }),
      });
      if (!res.ok) throw new Error('Submission failed');
      setDone(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#0F4C81]" />
      </div>
    );
  }

  if (alreadyResponded || done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-lg p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            {done ? 'Thank you! ☀️' : 'Already received!'}
          </h1>
          <p className="text-slate-500 text-sm">
            {done
              ? 'Your feedback helps us serve you better.'
              : 'We already have your feedback. Thank you for choosing Excess Renew Solar!'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-[#0F4C81] px-6 py-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <Sun className="h-6 w-6 text-[#F39C12]" />
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">Excess Renew Solar</p>
            <p className="text-blue-200 text-xs">Customer Feedback</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          <p className="text-slate-800 font-semibold text-base mb-1">
            How likely are you to recommend us?
          </p>
          <p className="text-slate-500 text-xs mb-5">
            0 = Not at all likely &nbsp;·&nbsp; 10 = Extremely likely
          </p>

          {/* Score buttons */}
          <div className="grid grid-cols-6 gap-2 mb-5">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setSelected(n)}
                className={`rounded-xl border-2 py-3 text-sm font-bold transition-all ${
                  selected === n
                    ? 'ring-2 ring-offset-1 ring-[#0F4C81] scale-105'
                    : ''
                } ${SCORE_COLORS[scoreCategory(n)]}`}
              >
                {n}
              </button>
            ))}
            {[6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                onClick={() => setSelected(n)}
                className={`rounded-xl border-2 py-3 text-sm font-bold transition-all ${
                  selected === n
                    ? 'ring-2 ring-offset-1 ring-[#0F4C81] scale-105'
                    : ''
                } ${SCORE_COLORS[scoreCategory(n)]}`}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Labels */}
          {selected !== null && (
            <p className={`text-xs font-medium mb-4 text-center ${
              scoreCategory(selected) === 'promoter' ? 'text-green-600'
              : scoreCategory(selected) === 'passive' ? 'text-amber-600'
              : 'text-red-600'
            }`}>
              {scoreCategory(selected) === 'promoter' ? '😊 Great! We love to hear that.'
               : scoreCategory(selected) === 'passive' ? '🙂 Thank you for your feedback!'
               : '😟 We\'re sorry to hear that. Your feedback helps us improve.'}
            </p>
          )}

          {/* Comment */}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us more (optional)"
            rows={3}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F4C81] resize-none mb-4"
          />

          {error && (
            <p className="text-xs text-red-600 mb-3 text-center">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={selected === null || submitting}
            className="w-full rounded-xl bg-[#0F4C81] py-3 text-sm font-semibold text-white transition-all hover:bg-[#0a3a6b] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit Feedback
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 pb-5">
          Excess Renew Solar · Coimbatore
        </p>
      </div>
    </div>
  );
}
