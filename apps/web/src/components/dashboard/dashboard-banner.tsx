'use client';

import { useAuth } from '@/hooks/use-auth';

export function DashboardBanner() {
  const { user } = useAuth();

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-dark via-primary to-primary-light p-6 text-white sm:p-7">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/banner-hero.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 hidden h-full w-auto object-cover sm:block"
      />
      <div className="relative max-w-xl">
        <p className="text-sm text-white/70">{today}</p>
        <h1 className="mt-1 text-2xl font-bold">Welcome back, {firstName} 👋</h1>
        <p className="mt-1.5 text-sm text-white/80">
          Here&apos;s what&apos;s happening across your solar pipeline today.
        </p>
      </div>
    </div>
  );
}
