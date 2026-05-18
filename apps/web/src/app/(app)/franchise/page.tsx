import { Suspense } from 'react';
import { FranchiseList } from '@/components/franchise/franchise-list';

export const metadata = { title: 'Franchise — Excess CRM' };

export default function FranchisePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Franchise Network</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage franchise partners and their performance.</p>
      </div>
      <Suspense fallback={<div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-white rounded-xl animate-pulse" />)}</div>}>
        <FranchiseList />
      </Suspense>
    </div>
  );
}
