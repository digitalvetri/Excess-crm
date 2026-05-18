'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Lead {
  id: string;
  name: string;
  phone: string;
  sourceType: string;
  stage: string;
  createdAt: string;
}

const STAGE_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  QUALIFIED: 'bg-green-100 text-green-700',
  FOLLOW_UP: 'bg-yellow-100 text-yellow-700',
  CONVERTED: 'bg-emerald-100 text-emerald-700',
  NOT_ANSWERED: 'bg-slate-100 text-slate-600',
  INVALID: 'bg-red-100 text-red-700',
};

export function RecentLeads() {
  const { data, isLoading } = useQuery({
    queryKey: ['recent-leads'],
    queryFn: () =>
      api.get<{ data: { leads: Lead[] } }>('/leads?limit=10').then((r) => r.data.data.leads),
  });

  return (
    <div className="bg-white rounded-xl border border-border">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h2 className="font-semibold text-slate-800">Recent Leads</h2>
        <Link href="/leads" className="text-sm text-primary hover:underline">View all</Link>
      </div>

      {isLoading ? (
        <div className="p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {(data ?? []).map((lead) => (
            <Link
              key={lead.id}
              href={`/leads/${lead.id}`}
              className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{lead.name}</p>
                <p className="text-xs text-slate-500">{lead.phone} · {lead.sourceType}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[lead.stage] ?? 'bg-slate-100 text-slate-600'}`}>
                {lead.stage.replace('_', ' ')}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
