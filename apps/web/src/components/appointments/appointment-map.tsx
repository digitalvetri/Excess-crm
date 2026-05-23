'use client';

import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';

const AppointmentMapInner = dynamic(
  () => import('./appointment-map-inner'),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  },
);

export function AppointmentMap() {
  return <AppointmentMapInner />;
}

function MapSkeleton() {
  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[520px] overflow-hidden rounded-2xl border border-border shadow-sm">
      {/* List skeleton */}
      <div className="flex w-[36%] shrink-0 flex-col border-r border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
          <div className="h-7 w-32 animate-pulse rounded-lg bg-slate-100" />
        </div>
        <div className="flex-1 space-y-2 p-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>

      {/* Map skeleton */}
      <div className="relative flex-1 bg-slate-100 flex flex-col items-center justify-center gap-3">
        <div className="animate-pulse">
          <MapPin size={36} className="text-slate-300" />
        </div>
        <p className="text-sm text-slate-400">Loading map…</p>
      </div>
    </div>
  );
}
