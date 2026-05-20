'use client';

import { useState, useEffect } from 'react';
import type React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  PhoneCall,
  Calendar,
  FileText,
  Hammer,
  Wrench,
  MessageSquare,
  Megaphone,
  BarChart3,
  Sparkles,
  Building2,
  DollarSign,
  Trophy,
  UserPlus,
  Star,
  Wallet,
  BookOpen,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Briefcase,
  PackageCheck,
  Radio,
  Network,
  Bot,
  Timer,
  Shuffle,
  Shield,
  Workflow,
} from 'lucide-react';
import { api } from '@/lib/api';

interface NavLink {
  href: string;
  label: string;
  icon: React.ElementType;
}
interface NavGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  items: NavLink[];
}

const SOLO_TOP: NavLink = { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard };

const GROUPS: NavGroup[] = [
  {
    id: 'sales',
    label: 'Sales',
    icon: Briefcase,
    items: [
      { href: '/leads', label: 'Leads', icon: Users },
      { href: '/calls', label: 'Calls', icon: PhoneCall },
      { href: '/appointments', label: 'Appointments', icon: Calendar },
      { href: '/quotations', label: 'Quotations', icon: FileText },
    ],
  },
  {
    id: 'delivery',
    label: 'Delivery',
    icon: PackageCheck,
    items: [
      { href: '/projects', label: 'Projects', icon: Hammer },
      { href: '/service-tickets', label: 'Service Tickets', icon: Wrench },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: Radio,
    items: [
      { href: '/whatsapp', label: 'WhatsApp', icon: MessageSquare },
      { href: '/broadcasts', label: 'Broadcasts', icon: Megaphone },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    items: [
      { href: '/reports', label: 'Reports', icon: BarChart3 },
      { href: '/insights', label: 'Insights', icon: Sparkles },
    ],
  },
  {
    id: 'franchise',
    label: 'Franchise',
    icon: Building2,
    items: [
      { href: '/franchise', label: 'Franchises', icon: Building2 },
      { href: '/commissions', label: 'Commissions', icon: DollarSign },
      { href: '/teams', label: 'Teams', icon: Users },
    ],
  },
  {
    id: 'engagement',
    label: 'Engagement',
    icon: Network,
    items: [
      { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
      { href: '/referrals', label: 'Referrals', icon: UserPlus },
      { href: '/reviews', label: 'Reviews', icon: Star },
      { href: '/wallet', label: 'Wallet', icon: Wallet },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    items: [
      { href: '/settings/voice-agent', label: 'Voice Agent', icon: Bot },
      { href: '/settings/sla-rules', label: 'SLA Rules', icon: Timer },
      { href: '/settings/assignment-rules', label: 'Assignment Rules', icon: Shuffle },
      { href: '/settings/stage-gates', label: 'Stage Gates', icon: Shield },
      { href: '/settings/sequences', label: 'Drip Sequences', icon: Workflow },
    ],
  },
];

const SOLO_BOTTOM: NavLink[] = [
  { href: '/knowledge-base', label: 'Knowledge Base', icon: BookOpen },
];

const ALL_LINKS: NavLink[] = [SOLO_TOP, ...GROUPS.flatMap((g) => g.items), ...SOLO_BOTTOM];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

const NAV_STORAGE_KEY = 'excess.nav.groups';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);

  // Restore expanded groups (client-only — localStorage is undefined during SSR)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(NAV_STORAGE_KEY);
      if (stored) setExpanded(JSON.parse(stored) as string[]);
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const activeGroupId = GROUPS.find((g) => g.items.some((i) => isActive(pathname, i.href)))?.id ?? null;
  const pageTitle = ALL_LINKS.find((l) => isActive(pathname, l.href))?.label ?? 'Excess CRM';

  function toggleGroup(id: string) {
    setExpanded((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function handleLogout() {
    await api.post('/auth/logout');
    router.push('/login');
  }

  const closeMobile = () => setSidebarOpen(false);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-border flex flex-col transform transition-transform duration-200 lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between h-[72px] px-5 border-b border-border shrink-0">
          <Link href="/dashboard" onClick={closeMobile} className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="Excess Renew Tech" className="h-10 w-auto rounded" />
          </Link>
          <button onClick={closeMobile} className="lg:hidden text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <NavItem link={SOLO_TOP} pathname={pathname} onNavigate={closeMobile} />

          <div className="pt-3 pb-1">
            <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Modules</p>
          </div>

          {GROUPS.map((group) => {
            const open = expanded.includes(group.id) || activeGroupId === group.id;
            const groupActive = activeGroupId === group.id;
            const GroupIcon = group.icon;
            return (
              <div key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    groupActive
                      ? 'text-slate-900'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <GroupIcon size={18} className={groupActive ? 'text-primary' : 'text-slate-400'} />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown
                    size={15}
                    className={`text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}
                  />
                </button>
                {open && (
                  <div className="ml-[22px] mt-0.5 mb-1 pl-3 border-l border-border space-y-0.5">
                    {group.items.map((item) => (
                      <NavItem key={item.href} link={item} pathname={pathname} onNavigate={closeMobile} sub />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="pt-3 mt-2 border-t border-border space-y-1">
            {SOLO_BOTTOM.map((link) => (
              <NavItem key={link.href} link={link} pathname={pathname} onNavigate={closeMobile} />
            ))}
          </div>
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-border shrink-0">
          <div className="flex items-center gap-3 px-2 py-2">
            <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
              EA
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 truncate">Excess Admin</p>
              <p className="text-xs text-slate-400 truncate">Excess Renew Tech</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="text-slate-400 hover:text-danger transition-colors p-1.5"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={closeMobile} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-border flex items-center px-4 sm:px-6 gap-3 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-slate-500 hover:text-slate-800"
          >
            <Menu size={22} />
          </button>
          <h1 className="text-base font-semibold text-slate-800 truncate">{pageTitle}</h1>
          <div className="flex-1" />
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-success bg-success/10 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            Live
          </span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

function NavItem({
  link,
  pathname,
  onNavigate,
  sub = false,
}: {
  link: NavLink;
  pathname: string;
  onNavigate: () => void;
  sub?: boolean;
}) {
  const active = isActive(pathname, link.href);
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      className={`flex items-center gap-2.5 rounded-lg text-sm transition-colors ${
        sub ? 'px-3 py-2' : 'px-3 py-2.5 font-medium'
      } ${
        active
          ? 'bg-primary text-white shadow-sm'
          : 'text-slate-500 hover:text-primary hover:bg-primary/5'
      }`}
    >
      <Icon size={sub ? 16 : 18} />
      {link.label}
    </Link>
  );
}
