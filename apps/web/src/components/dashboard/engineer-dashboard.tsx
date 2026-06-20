'use client';

import Link from 'next/link';
import { Calendar, Hammer, Wrench, BookOpen } from 'lucide-react';
import { DashboardBanner } from '@/components/dashboard/dashboard-banner';

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

// Field engineers handle site visits, installs and service — not the sales pipeline.
export function EngineerDashboard() {
  return (
    <div className="space-y-6">
      <DashboardBanner />

      <div>
        <h2 className="font-semibold text-slate-800">Field Work</h2>
        <p className="text-sm text-slate-500 mt-0.5">Your site visits, installations and service jobs.</p>
      </div>

      <div className="space-y-3">
        <QuickLink
          href="/appointments"
          icon={Calendar}
          title="Appointments"
          description="Your scheduled site visits and surveys"
        />
        <QuickLink
          href="/projects"
          icon={Hammer}
          title="Projects"
          description="Installations assigned to you"
        />
        <QuickLink
          href="/service-tickets"
          icon={Wrench}
          title="Service Tickets"
          description="Open service and maintenance jobs"
        />
        <QuickLink
          href="/knowledge-base"
          icon={BookOpen}
          title="Knowledge Base"
          description="Installation guides and references"
        />
      </div>
    </div>
  );
}
