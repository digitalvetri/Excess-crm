'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export default function TwoFactorPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;

    setLoading(true);
    try {
      const preAuthToken = sessionStorage.getItem('preAuthToken') ?? '';
      await api.post('/auth/2fa/verify', { preAuthToken, totp: code });
      sessionStorage.removeItem('preAuthToken');
      router.push('/dashboard');
    } catch {
      toast.error('Invalid or expired code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-xl font-bold text-slate-800 mb-2">Two-Factor Auth</h2>
        <p className="text-slate-500 text-sm mb-6">Enter the 6-digit code from your authenticator app.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full text-center tracking-widest text-2xl border border-border rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="000000"
          />
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full bg-primary text-white py-2.5 rounded-lg font-medium text-sm hover:bg-primary-light transition-colors disabled:opacity-50"
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </form>

        <p className="text-center mt-4">
          <a href="/login" className="text-sm text-primary hover:underline">Back to login</a>
        </p>
      </div>
    </div>
  );
}
