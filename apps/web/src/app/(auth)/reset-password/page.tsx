'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { z } from 'zod';
import { api } from '@/lib/api';

const schema = z.string().min(8, 'At least 8 characters');

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = schema.safeParse(password);
    if (!result.success) {
      toast.error(result.error.errors[0]?.message ?? 'Invalid password');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      toast.success('Password reset successfully');
      router.push('/login');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to reset password';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-danger">Invalid or missing reset token.</p>
        <a href="/forgot-password" className="mt-4 inline-block text-sm text-primary hover:underline">
          Request a new link
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        type="password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        placeholder="New password (min 8 chars)"
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-white py-2.5 rounded-lg font-medium text-sm hover:bg-primary-light transition-colors disabled:opacity-50"
      >
        {loading ? 'Resetting…' : 'Reset password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-xl font-bold text-slate-800 mb-6">Set new password</h2>
        <Suspense fallback={<div className="h-20 animate-pulse bg-slate-100 rounded-lg" />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
