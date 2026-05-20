import { Suspense } from 'react';
import { DashboardStats } from '@/components/dashboard/stats';
import { RecentLeads } from '@/components/dashboard/recent-leads';

export const metadata = { title: 'Dashboard — Excess CRM' };

export default function DashboardPage() {
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary-light p-6 sm:p-7 text-white">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
        <div className="absolute right-6 top-20 h-24 w-24 rounded-full bg-white/5" />
        <div className="relative">
          <p className="text-sm text-white/70">{today}</p>
          <h1 className="mt-1 text-2xl font-bold">Welcome back, Excess Admin</h1>
          <p className="mt-1 text-sm text-white/80">
            Here&apos;s what&apos;s happening across your solar pipeline today.
          </p>
        </div>
      </div>

      <Suspense fallback={<StatsSkeleton />}>
        <DashboardStats />
      </Suspense>

      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl border border-border bg-white" />}>
        <RecentLeads />
      </Suspense>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-white" />
      ))}
    </div>
  );
}
