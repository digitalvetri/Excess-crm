'use client';

import { useAuth } from '@/hooks/use-auth';
import { Sun, Sparkles } from 'lucide-react';

export function DashboardBanner() {
  const { user } = useAuth();

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="relative isolate overflow-hidden rounded-2xl p-6 text-white shadow-lg shadow-primary/20 sm:p-8
                    bg-[linear-gradient(125deg,#08512A_0%,#0B7A3D_46%,#16A34A_100%)]">
      {/* warm amber "sun" glow bleeding in from the top-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-28 h-80 w-80 rounded-full blur-2xl
                   bg-[radial-gradient(circle,rgba(243,156,18,0.55),rgba(243,156,18,0)_70%)]"
      />
      {/* soft top sheen for depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-1/2 h-full
                   bg-[radial-gradient(60%_120%_at_50%_0%,rgba(255,255,255,0.16),transparent)]"
      />
      {/* faint solar-panel grid, fading toward the right */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 45%)',
          maskImage: 'linear-gradient(90deg, transparent, #000 45%)',
        }}
      />

      {/* decorative sun with orbit rings + glow (desktop only) */}
      <div aria-hidden className="absolute right-6 top-1/2 hidden -translate-y-1/2 sm:right-10 sm:block">
        <div className="animate-float-y relative grid h-32 w-32 place-items-center">
          <div className="animate-sun-pulse absolute h-28 w-28 rounded-full bg-amber-300/40 blur-2xl" />
          <div className="absolute h-32 w-32 rounded-full ring-1 ring-white/10" />
          <div className="absolute h-24 w-24 rounded-full ring-1 ring-white/15" />
          <div className="relative grid h-16 w-16 place-items-center rounded-full ring-2 ring-white/40
                          bg-gradient-to-br from-amber-200 to-amber-400 shadow-[0_8px_44px_rgba(243,156,18,0.55)]">
            <Sun className="h-7 w-7 text-amber-700/80" strokeWidth={2.2} />
          </div>
        </div>
      </div>

      {/* content */}
      <div className="relative max-w-xl">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 text-xs font-medium
                         text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
          <Sparkles className="h-3.5 w-3.5 text-amber-200" />
          {today}
        </span>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-[28px] sm:leading-tight">
          Welcome back, {firstName} <span className="animate-wave">👋</span>
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-white/85 sm:text-[15px]">
          Here&apos;s what&apos;s happening across your solar pipeline today.
        </p>
      </div>

      {/* thin amber horizon line at the base */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px
                   bg-gradient-to-r from-transparent via-amber-200/40 to-transparent"
      />
    </div>
  );
}
