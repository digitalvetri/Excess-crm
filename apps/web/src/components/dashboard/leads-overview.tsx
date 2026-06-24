'use client';

import dynamic from 'next/dynamic';

// Lazy-load the recharts chart so it (and recharts itself) leave the dashboard's
// initial bundle. A skeleton card holds the layout while it streams in.
const LeadsOverviewChart = dynamic(
  () => import('./leads-overview-chart').then((m) => m.LeadsOverview),
  {
    ssr: false,
    loading: () => <div className="h-[260px] rounded-xl border border-border bg-white p-5 animate-pulse" />,
  },
);

export function LeadsOverview() {
  return <LeadsOverviewChart />;
}
