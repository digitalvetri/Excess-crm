import { Suspense } from 'react';
import { DashboardStats } from '@/components/dashboard/stats';
import { RecentLeads } from '@/components/dashboard/recent-leads';
import { LeadsOverview } from '@/components/dashboard/leads-overview';
import { TopSources } from '@/components/dashboard/top-sources';

export const metadata = { title: 'Dashboard — Excess CRM' };

function BannerArt() {
  return (
    <svg
      viewBox="0 0 280 190"
      className="pointer-events-none absolute right-0 top-0 hidden h-full w-auto sm:block"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="208" cy="56" r="48" fill="#ffffff" fillOpacity="0.06" />
      <circle cx="208" cy="56" r="18" fill="#ffffff" fillOpacity="0.85" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4;
        return (
          <line
            key={i}
            x1={208 + Math.cos(a) * 26}
            y1={56 + Math.sin(a) * 26}
            x2={208 + Math.cos(a) * 36}
            y2={56 + Math.sin(a) * 36}
            stroke="#ffffff"
            strokeOpacity="0.45"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        );
      })}
      <g transform="rotate(-13 165 140)">
        <rect
          x="110"
          y="112"
          width="116"
          height="58"
          rx="3"
          fill="#ffffff"
          fillOpacity="0.14"
          stroke="#ffffff"
          strokeOpacity="0.5"
          strokeWidth="1.5"
        />
        <line x1="139" y1="112" x2="139" y2="170" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.2" />
        <line x1="168" y1="112" x2="168" y2="170" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.2" />
        <line x1="197" y1="112" x2="197" y2="170" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.2" />
        <line x1="110" y1="141" x2="226" y2="141" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.2" />
      </g>
    </svg>
  );
}

export default function DashboardPage() {
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-dark via-primary to-primary-light p-6 text-white sm:p-7">
        <BannerArt />
        <div className="relative max-w-xl">
          <p className="text-sm text-white/70">{today}</p>
          <h1 className="mt-1 text-2xl font-bold">Welcome back, Excess Admin 👋</h1>
          <p className="mt-1.5 text-sm text-white/80">
            Here&apos;s what&apos;s happening across your solar pipeline today.
          </p>
        </div>
      </div>

      <Suspense fallback={<StatsSkeleton />}>
        <DashboardStats />
      </Suspense>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Suspense fallback={<div className="h-96 animate-pulse rounded-xl border border-border bg-white" />}>
            <RecentLeads />
          </Suspense>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <LeadsOverview />
          <TopSources />
        </div>
      </div>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-white" />
      ))}
    </div>
  );
}
