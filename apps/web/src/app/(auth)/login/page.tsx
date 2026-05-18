'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { api } from '@/lib/api';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
type FormData = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      const res = await api.post<{
        data: { requiresTwoFactor?: boolean; preAuthToken?: string; user?: { role: string } };
      }>('/auth/login', data);

      if (res.data.data.requiresTwoFactor) {
        sessionStorage.setItem('preAuthToken', res.data.data.preAuthToken ?? '');
        router.push('/2fa' as Route);
        return;
      }

      const redirect = searchParams.get('redirect') ?? '/dashboard';
      router.push(redirect as Route);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message :
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Login failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input
          {...register('email')}
          type="email"
          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="you@excessrenew.com"
        />
        {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <input
          {...register('password')}
          type="password"
          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="••••••••"
        />
        {errors.password && <p className="text-danger text-xs mt-1">{errors.password.message}</p>}
      </div>

      <div className="text-right">
        <a href="/forgot-password" className="text-sm text-primary hover:underline">
          Forgot password?
        </a>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-white py-2.5 rounded-lg font-medium text-sm hover:bg-primary-light transition-colors disabled:opacity-50"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-primary">Excess CRM</h1>
          <p className="text-slate-500 text-sm mt-1">Excess Renew Tech Pvt Ltd</p>
        </div>
        <Suspense fallback={<div className="h-40 animate-pulse bg-slate-100 rounded-lg" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
