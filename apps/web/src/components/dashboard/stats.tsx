'use client';

import { useQuery } from '@tanstack/react-query';
import { Users, UserPlus, PhoneCall, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type React from 'react';
import { api } from '@/lib/api';

interface StatsData {
  totalLeads: number;
  newToday: number;
  callsToday: number;
  conversionRate: number;
  converted: number;
  newYesterday: number;
  callsYesterday: number;
}

type Tone = 'up' | 'down' | 'flat';

interface StatCard {
  label: string;
  value: string;
  icon: React.ElementType;
  tint: string;
  iconColor: string;
  sub: { text: string; tone: Tone };
}

function deltaInfo(today: number, yesterday: number): { text: string; tone: Tone } {
  if (today === yesterday) return { text: 'Same as yesterday', tone: 'flat' };
  if (yesterday === 0) return { text: `+${today} vs none yesterday`, tone: 'up' };
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  return { text: `${pct > 0 ? '+' : ''}${pct}% vs yesterday`, tone: pct > 0 ? 'up' : 'down' };
}

const TONE_STYLE: Record<Tone, { color: string; Icon: React.ElementType }> = {
  up: { color: 'text-success', Icon: TrendingUp },
  down: { color: 'text-danger', Icon: TrendingDown },
  flat: { color: 'text-slate-400', Icon: Minus },
};

export function DashboardStats() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<{ data: StatsData }>('/leads/stats').then((r) => r.data.data),
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-white" />
        ))}
      </div>
    );
  }

  const cards: StatCard[] = [
    {
      label: 'Total Leads',
      value: data.totalLeads.toLocaleString(),
      icon: Users,
      tint: 'bg-primary/10',
      iconColor: 'text-primary',
      sub: data.newToday > 0
        ? { text: `+${data.newToday} added today`, tone: 'up' }
        : { text: 'No new leads today', tone: 'flat' },
    },
    {
      label: 'New Today',
      value: data.newToday.toLocaleString(),
      icon: UserPlus,
      tint: 'bg-accent/15',
      iconColor: 'text-accent',
      sub: deltaInfo(data.newToday, data.newYesterday),
    },
    {
      label: 'Calls Today',
      value: data.callsToday.toLocaleString(),
      icon: PhoneCall,
      tint: 'bg-sky-100',
      iconColor: 'text-sky-600',
      sub: deltaInfo(data.callsToday, data.callsYesterday),
    },
    {
      label: 'Conversion Rate',
      value: `${data.conversionRate}%`,
      icon: TrendingUp,
      tint: 'bg-success/10',
      iconColor: 'text-success',
      sub: { text: `${data.converted.toLocaleString()} leads converted`, tone: 'flat' },
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, tint, iconColor, sub }) => {
        const tone = TONE_STYLE[sub.tone];
        return (
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
            <p className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${tone.color}`}>
              <tone.Icon size={13} />
              {sub.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
