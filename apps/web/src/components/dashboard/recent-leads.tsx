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

const AVATAR_COLORS = [
  'bg-primary/10 text-primary',
  'bg-accent/15 text-accent',
  'bg-sky-100 text-sky-600',
  'bg-purple-100 text-purple-600',
  'bg-rose-100 text-rose-600',
  'bg-emerald-100 text-emerald-600',
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function RecentLeads() {
  const { data, isLoading } = useQuery({
    queryKey: ['recent-leads'],
    queryFn: () =>
      api.get<{ data: { leads: Lead[] } }>('/leads?limit=6').then((r) => r.data.data.leads),
  });

  return (
    <div className="rounded-xl border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-semibold text-slate-800">Recent Leads</h2>
        <Link href="/leads" className="text-sm font-medium text-primary hover:underline">
          View all
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-400">No leads yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {data.map((lead) => (
            <div
              key={lead.id}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarColor(lead.name)}`}
              >
                {initials(lead.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{lead.name}</p>
                <p className="truncate text-xs text-slate-400">
                  {lead.phone} · {lead.sourceType.replace(/_/g, ' ')}
                </p>
              </div>
              <Link
                href={`/leads/${lead.id}`}
                className="shrink-0 rounded-md border border-primary/20 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
              >
                View
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
