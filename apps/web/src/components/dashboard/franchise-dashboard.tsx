'use client';

import Link from 'next/link';
import { Users, UserPlus, Trophy, TrendingUp } from 'lucide-react';
import { DashboardBanner } from '@/components/dashboard/dashboard-banner';
import { useLeadStats } from '@/hooks/use-leads';
import { useReferralSummary } from '@/hooks/use-engagement';

interface StatCardProps {
  label: string;
  value: string;
  loading?: boolean;
}

function StatCard({ label, value, loading }: StatCardProps) {
  return (
    <div className="rounded-lg bg-primary/5 p-4">
      {loading ? (
        <div className="h-8 w-12 animate-pulse rounded bg-primary/10" />
      ) : (
        <p className="text-2xl font-bold text-slate-800">{value}</p>
      )}
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}

interface QuickLinkProps {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
}

function QuickLink({ href, icon: Icon, title, description }: QuickLinkProps) {
  return (
    <Link
      href={href}
      className="flex items-start gap-4 rounded-xl border border-border bg-white p-5 transition-colors hover:border-primary/30 hover:bg-primary/5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon size={18} className="text-primary" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-slate-800">{title}</p>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
      <span className="ml-auto shrink-0 text-slate-300">→</span>
    </Link>
  );
}

export function FranchiseDashboard() {
  const { data: stats, isLoading: statsLoading } = useLeadStats();
  const { data: referrals, isLoading: refLoading } = useReferralSummary();

  return (
    <div className="space-y-6">
      <DashboardBanner />

      {/* My Performance */}
      <div className="rounded-xl border border-border bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-primary" />
          <h2 className="font-semibold text-slate-800">My Performance</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Leads received" value={(stats?.totalLeads ?? 0).toLocaleString()} loading={statsLoading} />
          <StatCard label="Converted" value={(stats?.converted ?? 0).toLocaleString()} loading={statsLoading} />
          <StatCard label="Referrals submitted" value={(referrals?.total ?? 0).toLocaleString()} loading={refLoading} />
        </div>
      </div>

      {/* Quick links */}
      <div className="space-y-3">
        <QuickLink
          href="/leads"
          icon={Users}
          title="My Leads"
          description="View and manage your assigned leads"
        />
        <QuickLink
          href="/referrals"
          icon={UserPlus}
          title="Referrals"
          description="Submit a referral to earn commission"
        />
        <QuickLink
          href="/leaderboard"
          icon={Trophy}
          title="Leaderboard"
          description="See your ranking among franchise partners"
        />
      </div>
    </div>
  );
}
