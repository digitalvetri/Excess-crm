'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
type FormData = z.infer<typeof schema>;

const HIGHLIGHTS = [
  'AI voice agent dials every new lead within 5 seconds',
  'Track installs from site survey to commissioning',
  'Live forecasting, insights & franchise network',
];

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
        router.push('/2fa');
        return;
      }

      const redirect = searchParams.get('redirect') ?? '/dashboard';
      router.push(redirect);
    } catch (err: unknown) {
      const apiMsg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      const message = apiMsg ?? (err instanceof Error ? err.message : 'Login failed');
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
          className="w-full border border-border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-shadow"
          placeholder="you@excessrenew.com"
        />
        {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <input
          {...register('password')}
          type="password"
          className="w-full border border-border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-shadow"
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
        className="w-full bg-primary text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-primary-light transition-colors disabled:opacity-50"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex bg-white">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Pure-CSS solar brand hero — no raster image (was a 2.2MB PNG) */}
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#08512A_0%,#0B7A3D_50%,#0A5E30_100%)]" />
        <div
          aria-hidden
          className="absolute -right-20 -top-28 h-[28rem] w-[28rem] rounded-full blur-3xl
                     bg-[radial-gradient(circle,rgba(243,156,18,0.45),rgba(243,156,18,0)_70%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '30px 30px',
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="bg-white rounded-xl p-3 self-start shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="Excess Renew Tech" className="h-11 w-auto rounded" />
          </div>

          <div>
            <h2 className="text-4xl font-bold leading-tight">
              Power your solar business with intelligence.
            </h2>
            <p className="mt-4 text-white/80 text-lg">
              From first call to commissioned rooftop — one CRM for the whole journey.
            </p>
            <ul className="mt-8 space-y-3.5">
              {HIGHLIGHTS.map((h) => (
                <li key={h} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                    <Check size={14} className="text-white" />
                  </span>
                  <span className="text-white/90 text-sm">{h}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-white/55 text-xs">© Excess Renew Tech Pvt Ltd · Coimbatore</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="Excess Renew Tech" className="h-12 w-auto rounded" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
          <p className="text-slate-500 text-sm mt-1 mb-7">Sign in to your Excess CRM workspace</p>

          <Suspense fallback={<div className="h-56 animate-pulse bg-slate-100 rounded-lg" />}>
            <LoginForm />
          </Suspense>

          <p className="text-center text-xs text-slate-400 mt-8">
            Excellence in Energy Saving Solutions
          </p>
        </div>
      </div>
    </div>
  );
}
