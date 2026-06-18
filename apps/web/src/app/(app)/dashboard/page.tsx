import { Suspense } from 'react';
import { DashboardStats } from '@/components/dashboard/stats';
import { RecentLeads } from '@/components/dashboard/recent-leads';
import { LeadsOverview } from '@/components/dashboard/leads-overview';
import { TopSources } from '@/components/dashboard/top-sources';
import { PipelineFunnel } from '@/components/dashboard/pipeline-funnel';
import { TodayAppointments } from '@/components/dashboard/today-appointments';
import { VoiceActivity } from '@/components/dashboard/voice-activity';
import { FranchiseSnapshot } from '@/components/dashboard/franchise-snapshot';
import { DashboardBanner } from '@/components/dashboard/dashboard-banner';

export const metadata = { title: 'Dashboard — Excess CRM' };

function CardSkeleton({ h = 'h-64' }: { h?: string }) {
  return <div className={`${h} animate-pulse rounded-xl border border-border bg-white`} />;
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <DashboardBanner />

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
