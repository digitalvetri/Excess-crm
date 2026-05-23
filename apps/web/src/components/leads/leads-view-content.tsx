'use client';

import { useState, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { LayoutList, LayoutGrid, Bookmark, BookmarkPlus, Trash2, Share2, X, Download } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { LeadsTable } from './leads-table';
import { LeadsKanban } from './leads-kanban';
import { useSavedViews, useCreateSavedView, useDeleteSavedView } from '@/hooks/use-leads';

function SavedViewsBar() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data: views, isLoading } = useSavedViews();
  const createView = useCreateSavedView();
  const deleteView = useDeleteSavedView();
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [isShared, setIsShared] = useState(false);

  function applyView(filters: Record<string, string>) {
    const params = new URLSearchParams(filters);
    router.push(`${pathname}?${params.toString()}`);
  }

  async function saveCurrentView() {
    if (!viewName.trim()) return;
    const currentFilters: Record<string, string> = {};
    searchParams.forEach((v, k) => { if (k !== 'view') currentFilters[k] = v; });
    try {
      await createView.mutateAsync({ name: viewName.trim(), filters: currentFilters, isShared });
      toast.success(`View "${viewName.trim()}" saved`);
      setViewName('');
      setSaveOpen(false);
    } catch {
      toast.error('Failed to save view');
    }
  }

  if (isLoading) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
          <Bookmark size={11} /> Saved Views
        </span>
        {(views ?? []).map((v) => (
          <div key={v.id} className="group flex items-center gap-0.5">
            <button
              onClick={() => applyView(v.filters)}
              className="inline-flex items-center gap-1 text-xs bg-slate-100 hover:bg-primary/10 hover:text-primary text-slate-600 px-2.5 py-1 rounded-full transition-colors"
            >
              {v.icon && <span>{v.icon}</span>}
              {v.name}
              {v.isShared && <Share2 size={9} className="opacity-60" />}
            </button>
            <button
              onClick={async () => {
                try { await deleteView.mutateAsync(v.id); toast.success('View deleted'); }
                catch { toast.error('Failed to delete view'); }
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-danger"
              title="Delete view"
            >
              <Trash2 size={10} className="text-slate-400 hover:text-danger" />
            </button>
          </div>
        ))}
        <button
          onClick={() => setSaveOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-primary px-2 py-1 rounded-full border border-dashed border-slate-300 hover:border-primary transition-colors"
        >
          <BookmarkPlus size={11} /> Save current filters
        </button>
      </div>

      {saveOpen && (
        <div className="flex items-center gap-2 bg-slate-50 border border-border rounded-lg px-3 py-2">
          <Bookmark size={13} className="text-slate-400 shrink-0" />
          <input
            autoFocus
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void saveCurrentView(); if (e.key === 'Escape') setSaveOpen(false); }}
            placeholder="View name (e.g. New leads today)..."
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-400"
          />
          <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer">
            <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} className="accent-primary" />
            Shared
          </label>
          <button
            onClick={() => void saveCurrentView()}
            disabled={!viewName.trim() || createView.isPending}
            className="text-xs bg-primary text-white px-3 py-1 rounded-lg disabled:opacity-50"
          >
            Save
          </button>
          <button onClick={() => setSaveOpen(false)} className="text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

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

  async function handleExport() {
    try {
      const res = await api.get('/leads/export', {
        responseType: 'blob',
      });
      const blob = new Blob([res.data as BlobPart], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    }
  }

  return (
    <div className="space-y-3">
      {/* Saved views + view toggle row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <Suspense fallback={null}>
          <SavedViewsBar />
        </Suspense>

        {/* List / Kanban toggle + Export */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <button
            onClick={() => void handleExport()}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-slate-600 hover:text-primary hover:border-primary transition-colors bg-white"
          >
            <Download size={13} /> Export CSV
          </button>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-all ${
                view === 'list'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutList size={14} /> List
            </button>
            <button
              onClick={() => setView('kanban')}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-all ${
                view === 'kanban'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutGrid size={14} /> Kanban
            </button>
          </div>
        </div>
      </div>

      <Suspense fallback={<div className="h-96 bg-white rounded-xl animate-pulse" />}>
        {view === 'kanban' ? <LeadsKanban /> : <LeadsTable />}
      </Suspense>
    </div>
  );
}
