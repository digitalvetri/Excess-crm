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
  borderAccent: string;
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
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 sm:h-32 animate-pulse rounded-xl border border-border bg-white" />
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
      borderAccent: 'border-l-primary',
      sub: data.newToday > 0
        ? { text: `+${data.newToday} added today`, tone: 'up' }
        : { text: 'No new leads today', tone: 'flat' },
    },
    {
      label: 'New Today',
      value: data.newToday.toLocaleString(),
      icon: UserPlus,
      tint: 'bg-amber-50',
      iconColor: 'text-accent',
      borderAccent: 'border-l-accent',
      sub: deltaInfo(data.newToday, data.newYesterday),
    },
    {
      label: 'Calls Today',
      value: data.callsToday.toLocaleString(),
      icon: PhoneCall,
      tint: 'bg-sky-50',
      iconColor: 'text-sky-600',
      borderAccent: 'border-l-sky-500',
      sub: deltaInfo(data.callsToday, data.callsYesterday),
    },
    {
      label: 'Conversion',
      value: `${data.conversionRate}%`,
      icon: TrendingUp,
      tint: 'bg-success/10',
      iconColor: 'text-success',
      borderAccent: 'border-l-success',
      sub: { text: `${data.converted.toLocaleString()} converted`, tone: 'flat' },
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, tint, iconColor, borderAccent, sub }) => {
        const tone = TONE_STYLE[sub.tone];
        return (
          <div
            key={label}
            className={`rounded-xl border border-border border-l-4 ${borderAccent} bg-white p-4 sm:p-5 transition-shadow hover:shadow-md`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs sm:text-sm font-medium text-slate-500 leading-tight">{label}</p>
              <span className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg ${tint}`}>
                <Icon size={16} className={iconColor} />
              </span>
            </div>
            <p className="mt-2 sm:mt-3 text-2xl sm:text-3xl font-bold text-slate-800 tabular-nums">{value}</p>
            <p className={`mt-1 sm:mt-1.5 flex items-center gap-1 text-xs font-medium ${tone.color} truncate`}>
              <tone.Icon size={12} className="shrink-0" />
              <span className="truncate">{sub.text}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}
