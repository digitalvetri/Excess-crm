'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Stats {
  totalLeads: number;
  newToday: number;
  callsToday: number;
  conversionRate: number;
}

export function CallStats() {
  const { data } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<{ data: Stats }>('/leads/stats').then((r) => r.data.data),
  });

  const stats = [
    { label: 'Calls Today', value: data?.callsToday?.toLocaleString() ?? '—' },
    { label: 'Total Leads', value: data?.totalLeads?.toLocaleString() ?? '—' },
    { label: 'Conversion Rate', value: data ? `${data.conversionRate}%` : '—' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {stats.map(({ label, value }) => (
        <div key={label} className="bg-white rounded-xl border border-border p-5">
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{value}</p>
        </div>
      ))}
    </div>
  );
}
