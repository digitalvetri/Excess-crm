'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ServiceTicketAnalytics } from '@/components/service-tickets/service-ticket-analytics';

export default function ServiceTicketAnalyticsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/service-tickets" className="text-slate-400 hover:text-primary transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <h1 className="text-xl font-bold text-slate-900">Service Ticket Analytics</h1>
          </div>
          <p className="text-sm text-slate-500 ml-6">SLA compliance, type trends and engineer workload.</p>
        </div>
      </div>
      <ServiceTicketAnalytics />
    </div>
  );
}
