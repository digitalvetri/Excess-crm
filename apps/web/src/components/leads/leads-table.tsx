'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Phone, Mail, MapPin, ChevronRight, MoreVertical } from 'lucide-react';
import { useLeads } from '@/hooks/use-leads';
import { StageBadge } from './stage-badge';
import { StageChangeMenu } from './stage-change-menu';

const SOURCE_LABELS: Record<string, string> = {
  META: 'Meta',
  INDIAMART: 'IndiaMART',
  JUSTDIAL: 'JustDial',
  WEBSITE: 'Website',
  WHATSAPP: 'WhatsApp',
  MANUAL: 'Manual',
};

export function LeadsTable() {
  const { data, isLoading, isError } = useLeads();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stageMenuOpen, setStageMenuOpen] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 p-4 border-b border-border animate-pulse">
            <div className="w-4 h-4 bg-slate-200 rounded mt-1" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-48" />
              <div className="h-3 bg-slate-100 rounded w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 text-center">
        <p className="text-danger">Failed to load leads. Please refresh.</p>
      </div>
    );
  }

  const leads = data?.leads ?? [];

  if (leads.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-12 text-center">
        <p className="text-slate-500 text-sm">No leads found. Adjust filters or add a lead manually.</p>
      </div>
    );
  }

  function toggleAll() {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l) => l.id)));
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 bg-primary/5 border-b border-border">
          <span className="text-sm font-medium text-primary">{selected.size} selected</span>
          <button className="text-sm text-slate-600 hover:text-slate-900">Assign</button>
          <button className="text-sm text-slate-600 hover:text-slate-900">Change stage</button>
          <button className="text-sm text-slate-600 hover:text-slate-900" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {/* Header */}
      <div className="hidden md:flex items-center gap-4 px-4 py-2 border-b border-border bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wide">
        <input
          type="checkbox"
          checked={selected.size === leads.length && leads.length > 0}
          onChange={toggleAll}
          className="rounded"
        />
        <span className="flex-1">Lead</span>
        <span className="w-28">Stage</span>
        <span className="w-24">Source</span>
        <span className="w-28">Created</span>
        <span className="w-8" />
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {leads.map((lead) => (
          <div key={lead.id} className="flex items-start md:items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors group">
            <input
              type="checkbox"
              checked={selected.has(lead.id)}
              onChange={() => toggle(lead.id)}
              className="rounded mt-1 md:mt-0"
              onClick={(e) => e.stopPropagation()}
            />

            <Link href={`/leads/${lead.id}`} className="flex-1 min-w-0">
              <p className="font-medium text-slate-800 text-sm">{lead.name}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Phone size={11} /> {lead.phone}
                </span>
                {lead.email && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Mail size={11} /> {lead.email}
                  </span>
                )}
                {lead.city && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <MapPin size={11} /> {lead.city}
                  </span>
                )}
              </div>
            </Link>

            <div className="w-28 hidden md:block">
              <StageBadge stage={lead.stage} />
            </div>

            <div className="w-24 hidden md:block">
              <span className="text-xs text-slate-500">{SOURCE_LABELS[lead.sourceType] ?? lead.sourceType}</span>
            </div>

            <div className="w-28 hidden md:block">
              <span className="text-xs text-slate-400">
                {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
              </span>
            </div>

            <div className="relative">
              <button
                onClick={() => setStageMenuOpen(stageMenuOpen === lead.id ? null : lead.id)}
                className="p-1 rounded hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical size={16} className="text-slate-400" />
              </button>
              {stageMenuOpen === lead.id && (
                <StageChangeMenu
                  leadId={lead.id}
                  currentStage={lead.stage}
                  onClose={() => setStageMenuOpen(null)}
                />
              )}
            </div>

            <Link href={`/leads/${lead.id}`} className="hidden md:block opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight size={16} className="text-slate-400" />
            </Link>
          </div>
        ))}
      </div>

      {/* Load more */}
      {data?.hasMore && (
        <div className="px-4 py-3 border-t border-border">
          <button className="text-sm text-primary hover:underline">Load more</button>
        </div>
      )}
    </div>
  );
}
