'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface StatsData {
  totalLeads: number;
  newToday: number;
  callsToday: number;
  conversionRate: number;
}

export function DashboardStats() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<{ data: StatsData }>('/leads/stats').then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-5 animate-pulse h-28" />
        ))}
      </div>
    );
  }

  const stats = [
    { label: 'Total Leads', value: data?.totalLeads?.toLocaleString() ?? '—' },
    { label: 'New Today', value: data?.newToday?.toLocaleString() ?? '—' },
    { label: 'Calls Today', value: data?.callsToday?.toLocaleString() ?? '—' },
    { label: 'Conversion Rate', value: data ? `${data.conversionRate}%` : '—' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(({ label, value }) => (
        <div key={label} className="bg-white rounded-xl border border-border p-5">
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{value}</p>
        </div>
      ))}
    </div>
  );
}
