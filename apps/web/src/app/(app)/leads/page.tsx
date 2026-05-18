import { Suspense } from 'react';
import { LeadsTable } from '@/components/leads/leads-table';
import { LeadsFilters } from '@/components/leads/leads-filters';
import { CreateLeadButton } from '@/components/leads/create-lead-button';

export const metadata = { title: 'Leads — Excess CRM' };

export default function LeadsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Leads</h1>
        <CreateLeadButton />
      </div>

      <LeadsFilters />

      <Suspense fallback={<div className="h-96 bg-white rounded-xl animate-pulse" />}>
        <LeadsTable />
      </Suspense>
    </div>
  );
}
