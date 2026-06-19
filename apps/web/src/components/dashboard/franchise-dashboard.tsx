'use client';

import Link from 'next/link';
import { Users, UserPlus, Trophy, TrendingUp } from 'lucide-react';
import { DashboardBanner } from '@/components/dashboard/dashboard-banner';

interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-lg bg-primary/5 p-4">
      <p className="text-2xl font-bold text-slate-800">{value}</p>
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
  return (
    <div className="space-y-6">
      <DashboardBanner />

      {/* My Performance */}
      <div className="rounded-xl border border-border bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-primary" />
          <h2 className="font-semibold text-slate-800">My Performance — This Month</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Leads received" value="--" />
          <StatCard label="Converted" value="--" />
          <StatCard label="Referrals submitted" value="--" />
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
