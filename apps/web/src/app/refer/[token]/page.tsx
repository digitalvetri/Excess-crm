'use client';

import { use, useState } from 'react';
import { Sun } from 'lucide-react';

export default function ReferralPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!/^\d{10}$/.test(phone)) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/leads/refer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, city: city || undefined, referralToken: token }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Something went wrong');
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F4C81] to-[#0a3560] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#F39C12] mb-4 shadow-lg">
            <Sun size={32} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Excess Renew Solar</h1>
          <p className="text-blue-200 text-sm mt-1">Since 2009 · 500+ Installations</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {success ? (
            <div className="text-center py-6">
              <div className="text-5xl mb-4">☀️</div>
              <h2 className="text-xl font-bold text-[#0F4C81] mb-2">You&apos;re all set!</h2>
              <p className="text-slate-600">
                We&apos;ll call you within 5 minutes to discuss your free solar estimate.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-[#0F4C81] leading-tight">
                  Your neighbour is saving on electricity with solar!
                </h2>
                <p className="text-slate-500 mt-2 text-sm">
                  Get a FREE rooftop solar estimate — no obligation, no spam.
                </p>
              </div>

              {/* Trust signals */}
              <div className="flex gap-3 mb-6 text-xs text-slate-500">
                <span className="flex items-center gap-1">✅ PM Surya Ghar subsidy</span>
                <span className="flex items-center gap-1">✅ 25-year warranty</span>
              </div>

              <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Your Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Enter your name"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C81] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    required
                    placeholder="10-digit mobile number"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C81] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">City (optional)</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Your city"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C81] focus:border-transparent"
                  />
                </div>

                {error && (
                  <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-xl bg-[#F39C12] hover:bg-[#e08e0b] text-white font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
                >
                  {submitting ? 'Submitting…' : 'Get My Free Quote ☀️'}
                </button>
              </form>

              <p className="text-center text-xs text-slate-400 mt-4">
                We respect your privacy. No spam, ever.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
