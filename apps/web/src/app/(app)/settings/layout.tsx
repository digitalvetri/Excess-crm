'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SETTINGS_NAV = [
  { href: '/settings/voice-agent', label: 'Voice Agent' },
  { href: '/settings/sla-rules', label: 'SLA Rules' },
  { href: '/settings/assignment-rules', label: 'Assignment Rules' },
  { href: '/settings/stage-gates', label: 'Stage Gates' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex gap-8">
      <aside className="w-48 shrink-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 mb-2">Settings</p>
        <nav className="space-y-0.5">
          {SETTINGS_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
