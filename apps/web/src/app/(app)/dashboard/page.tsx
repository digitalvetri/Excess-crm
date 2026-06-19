import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { DashboardStats } from '@/components/dashboard/stats';
import { RecentLeads } from '@/components/dashboard/recent-leads';
import { LeadsOverview } from '@/components/dashboard/leads-overview';
import { TopSources } from '@/components/dashboard/top-sources';
import { PipelineFunnel } from '@/components/dashboard/pipeline-funnel';
import { TodayAppointments } from '@/components/dashboard/today-appointments';
import { VoiceActivity } from '@/components/dashboard/voice-activity';
import { FranchiseSnapshot } from '@/components/dashboard/franchise-snapshot';
import { DashboardBanner } from '@/components/dashboard/dashboard-banner';
import { FranchiseDashboard } from '@/components/dashboard/franchise-dashboard';

export const metadata = { title: 'Dashboard — Excess CRM' };

type UserRole = 'ADMIN' | 'EMPLOYEE' | 'FRANCHISE_OWNER' | 'FRANCHISE_USER' | 'ENGINEER';

function CardSkeleton({ h = 'h-64' }: { h?: string }) {
  return <div className={`${h} animate-pulse rounded-xl border border-border bg-white`} />;
}

function AdminDashboard() {
  return (
    <div className="space-y-6">
      <DashboardBanner />

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

function EmployeeDashboard() {
  return (
    <div className="space-y-6">
      <DashboardBanner />

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

      <Suspense fallback={<CardSkeleton h="h-80" />}>
        <RecentLeads />
      </Suspense>
    </div>
  );
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const role = cookieStore.get('excess_role')?.value as UserRole | undefined;

  // Middleware already verified excess_session — if excess_role is absent (e.g. cookie
  // domain mismatch in production), avoid redirecting to /login which would loop back
  // here indefinitely. Fallback to admin view; client components enforce permissions.
  if (!role) {
    return <AdminDashboard />;
  }

  if (role === 'FRANCHISE_OWNER' || role === 'FRANCHISE_USER') {
    return <FranchiseDashboard />;
  }

  if (role === 'EMPLOYEE' || role === 'ENGINEER') {
    return <EmployeeDashboard />;
  }

  // ADMIN (and any future roles that should see everything)
  return <AdminDashboard />;
}
