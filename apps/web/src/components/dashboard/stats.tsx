'use client';

import { useQuery } from '@tanstack/react-query';
import { Users, UserPlus, PhoneCall, TrendingUp } from 'lucide-react';
import type React from 'react';
import { api } from '@/lib/api';

interface StatsData {
  totalLeads: number;
  newToday: number;
  callsToday: number;
  conversionRate: number;
}

interface StatCard {
  label: string;
  value: string;
  icon: React.ElementType;
  tint: string;
  iconColor: string;
}

export function DashboardStats() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<{ data: StatsData }>('/leads/stats').then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-white" />
        ))}
      </div>
    );
  }

  const cards: StatCard[] = [
    {
      label: 'Total Leads',
      value: data?.totalLeads?.toLocaleString() ?? '—',
      icon: Users,
      tint: 'bg-primary/10',
      iconColor: 'text-primary',
    },
    {
      label: 'New Today',
      value: data?.newToday?.toLocaleString() ?? '—',
      icon: UserPlus,
      tint: 'bg-accent/10',
      iconColor: 'text-accent',
    },
    {
      label: 'Calls Today',
      value: data?.callsToday?.toLocaleString() ?? '—',
      icon: PhoneCall,
      tint: 'bg-sky-100',
      iconColor: 'text-sky-600',
    },
    {
      label: 'Conversion Rate',
      value: data ? `${data.conversionRate}%` : '—',
      icon: TrendingUp,
      tint: 'bg-success/10',
      iconColor: 'text-success',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, tint, iconColor }) => (
        <div
          key={label}
          className="rounded-xl border border-border bg-white p-5 transition-shadow hover:shadow-sm"
        >
          <div className="flex items-start justify-between">
            <p className="text-sm text-slate-500">{label}</p>
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tint}`}>
              <Icon size={17} className={iconColor} />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-800">{value}</p>
        </div>
      ))}
    </div>
  );
}
