import { Suspense } from 'react';
import { DashboardStats } from '@/components/dashboard/stats';
import { RecentLeads } from '@/components/dashboard/recent-leads';
import { LeadsOverview } from '@/components/dashboard/leads-overview';
import { TopSources } from '@/components/dashboard/top-sources';
import { PipelineFunnel } from '@/components/dashboard/pipeline-funnel';
import { TodayAppointments } from '@/components/dashboard/today-appointments';
import { VoiceActivity } from '@/components/dashboard/voice-activity';
import { FranchiseSnapshot } from '@/components/dashboard/franchise-snapshot';

export const metadata = { title: 'Dashboard — Excess CRM' };

function BannerArt() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/banner-hero.png"
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute right-0 top-0 hidden h-full w-auto object-cover sm:block"
    />
  );
}

function CardSkeleton({ h = 'h-64' }: { h?: string }) {
  return <div className={`${h} animate-pulse rounded-xl border border-border bg-white`} />;
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

      {/* KPI stat cards */}
      <Suspense
        fallback={
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-white" />
            ))}
          </div>
        }
      >
        <DashboardStats />
      </Suspense>

      {/* Row: Pipeline Funnel + Today's Appointments */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Suspense fallback={<CardSkeleton h="h-72" />}>
            <PipelineFunnel />
          </Suspense>
        </div>
        <div className="lg:col-span-3">
          <Suspense fallback={<CardSkeleton h="h-72" />}>
            <TodayAppointments />
          </Suspense>
        </div>
      </div>

      {/* Row: Leads Trend + Voice Activity + Top Sources */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-3">
          <LeadsOverview />
        </div>
        <div className="lg:col-span-1">
          <VoiceActivity />
        </div>
        <div className="lg:col-span-1">
          <TopSources />
        </div>
      </div>

      {/* Row: Recent Leads + Franchise Network */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Suspense fallback={<CardSkeleton h="h-80" />}>
            <RecentLeads />
          </Suspense>
        </div>
        <div className="lg:col-span-2">
          <FranchiseSnapshot />
        </div>
      </div>
    </div>
  );
}
