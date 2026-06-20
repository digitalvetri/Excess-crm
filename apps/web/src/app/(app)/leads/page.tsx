import { Suspense } from 'react';
import { LeadsFilters } from '@/components/leads/leads-filters';
import { CreateLeadButton } from '@/components/leads/create-lead-button';
import { LeadsViewContent } from '@/components/leads/leads-view-content';
import { LeadsKpiStrip } from '@/components/leads/leads-kpi-strip';

export const metadata = { title: 'Leads — Excess CRM' };

export default function LeadsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Leads</h1>
        <CreateLeadButton />
      </div>

      <Suspense fallback={<div className="h-16 bg-white rounded-xl animate-pulse" />}>
        <LeadsKpiStrip />
      </Suspense>

      <LeadsFilters />

      <Suspense fallback={<div className="h-96 bg-white rounded-xl animate-pulse" />}>
        <LeadsViewContent />
      </Suspense>
    </div>
  );
}
