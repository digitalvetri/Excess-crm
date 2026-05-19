'use client';

import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { LayoutList, LayoutGrid } from 'lucide-react';
import { LeadsTable } from './leads-table';
import { LeadsKanban } from './leads-kanban';

export function LeadsViewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view = searchParams.get('view') ?? 'list';

  function setView(v: 'list' | 'kanban') {
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', v);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={() => setView('list')}
          className={`p-1.5 rounded-lg transition-colors ${
            view === 'list'
              ? 'bg-primary text-white'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
          }`}
          title="List view"
        >
          <LayoutList size={16} />
        </button>
        <button
          onClick={() => setView('kanban')}
          className={`p-1.5 rounded-lg transition-colors ${
            view === 'kanban'
              ? 'bg-primary text-white'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
          }`}
          title="Kanban view"
        >
          <LayoutGrid size={16} />
        </button>
      </div>

      <Suspense fallback={<div className="h-96 bg-white rounded-xl animate-pulse" />}>
        {view === 'kanban' ? <LeadsKanban /> : <LeadsTable />}
      </Suspense>
    </div>
  );
}
