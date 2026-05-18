import { Suspense } from 'react';
import { CallLogTable } from '@/components/calls/call-log-table';
import { CallStats } from '@/components/calls/call-stats';

export const metadata = { title: 'Calls — Excess CRM' };

export default function CallsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Call Log</h1>
      </div>

      <Suspense fallback={<div className="grid grid-cols-3 gap-4">{Array.from({length:3}).map((_,i)=><div key={i} className="h-24 bg-white rounded-xl animate-pulse"/>)}</div>}>
        <CallStats />
      </Suspense>

      <Suspense fallback={<div className="h-96 bg-white rounded-xl animate-pulse" />}>
        <CallLogTable />
      </Suspense>
    </div>
  );
}
