'use client';

import dynamic from 'next/dynamic';

// Lazy-load the recharts pie chart so recharts leaves the dashboard's initial bundle.
const TopSourcesChart = dynamic(
  () => import('./top-sources-chart').then((m) => m.TopSources),
  {
    ssr: false,
    loading: () => <div className="h-[260px] rounded-xl border border-border bg-white p-5 animate-pulse" />,
  },
);

export function TopSources() {
  return <TopSourcesChart />;
}
