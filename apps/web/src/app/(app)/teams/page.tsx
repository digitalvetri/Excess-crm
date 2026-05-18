import { Suspense } from 'react';
import { TeamsList } from '@/components/teams/teams-list';

export const metadata = { title: 'Teams — Excess CRM' };

export default function TeamsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Teams</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage teams and lead routing rules.</p>
        </div>
      </div>

      <Suspense fallback={<div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-white rounded-xl animate-pulse" />)}</div>}>
        <TeamsList />
      </Suspense>
    </div>
  );
}
