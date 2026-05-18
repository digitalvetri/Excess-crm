import { Suspense } from 'react';
import { DashboardStats } from '@/components/dashboard/stats';
import { RecentLeads } from '@/components/dashboard/recent-leads';

export const metadata = { title: 'Dashboard — Excess CRM' };

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>

      <Suspense fallback={<Statsskeleton />}>
        <DashboardStats />
      </Suspense>

      <Suspense fallback={<div className="h-64 bg-white rounded-xl animate-pulse" />}>
        <RecentLeads />
      </Suspense>
    </div>
  );
}

function StatsCard({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-bold text-slate-800 mt-1">{value}</p>
      {delta && <p className="text-xs text-success mt-1">{delta}</p>}
    </div>
  );
}

function Statsskeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-border p-5 animate-pulse h-28" />
      ))}
    </div>
  );
}
