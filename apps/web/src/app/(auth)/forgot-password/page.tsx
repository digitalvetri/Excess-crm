'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      toast.error('Something went wrong, please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-4xl mb-4">📧</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Check your email</h2>
          <p className="text-slate-500 text-sm">
            If <strong>{email}</strong> is registered, a reset link has been sent.
          </p>
          <a href="/login" className="mt-6 inline-block text-sm text-primary hover:underline">
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-xl font-bold text-slate-800 mb-2">Reset password</h2>
        <p className="text-slate-500 text-sm mb-6">
          Enter your email address and we&apos;ll send a reset link.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="you@excessrenew.com"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-2.5 rounded-lg font-medium text-sm hover:bg-primary-light transition-colors disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <p className="text-center mt-4">
          <a href="/login" className="text-sm text-primary hover:underline">Back to login</a>
        </p>
      </div>
    </div>
  );
}
