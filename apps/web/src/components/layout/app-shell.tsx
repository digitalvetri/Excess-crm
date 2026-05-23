'use client';

import { useState, useEffect, useCallback } from 'react';
import type React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { NotificationPanel } from '@/components/notifications/notification-panel';
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
  Banknote,
  Trophy,
  UserPlus,
  Star,
  Wallet,
  BookOpen,
  Settings,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  X,
  ChevronDown,
  Briefcase,
  PackageCheck,
  ClipboardList,
  Radio,
  Network,
  Bot,
  Timer,
  Shuffle,
  Shield,
  Workflow,
  Webhook,
} from 'lucide-react';
import { api } from '@/lib/api';
import { CommandPalette } from '@/components/command-palette';

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
      { href: '/projects',         label: 'Projects',         icon: Hammer },
      { href: '/service-tickets',  label: 'Service Tickets',  icon: Wrench },
      { href: '/amc',              label: 'AMC Contracts',     icon: ClipboardList },
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
      { href: '/payouts', label: 'Payouts', icon: Banknote },
      { href: '/teams', label: 'Teams', icon: Users },
    ],
  },
  {
    id: 'engagement',
    label: 'Engagement',
    icon: Network,
    items: [
      { href: '/engagement', label: 'Engagement Hub', icon: Network },
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
      { href: '/settings/webhooks', label: 'Webhooks', icon: Webhook },
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
  const [darkMode, setDarkMode] = useState(false);

  // Restore expanded groups + dark mode (client-only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(NAV_STORAGE_KEY);
      if (stored) setExpanded(JSON.parse(stored) as string[]);
      const dark = localStorage.getItem('excess.dark') === 'true';
      setDarkMode(dark);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : '');
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const toggleDark = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.setAttribute('data-theme', next ? 'dark' : '');
      try { localStorage.setItem('excess.dark', String(next)); } catch { /* ignore */ }
      return next;
    });
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
      <CommandPalette />
      {/* Sidebar */}
      <aside
        suppressHydrationWarning
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-border flex flex-col transform transition-transform duration-200 ease-out lg:relative lg:translate-x-0 lg:shrink-0 ${
          sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between h-14 sm:h-16 px-4 sm:px-5 border-b border-border shrink-0 bg-white">
          <Link href="/dashboard" onClick={closeMobile} className="flex items-center gap-2 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="Excess Renew Tech" className="h-9 w-auto rounded shrink-0" />
          </Link>
          <button
            onClick={closeMobile}
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5" aria-label="Main navigation">
          <NavItem link={SOLO_TOP} pathname={pathname} onNavigate={closeMobile} />

          <div className="pt-4 pb-1 px-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Modules</p>
          </div>

          {GROUPS.map((group) => {
            const open = expanded.includes(group.id) || activeGroupId === group.id;
            const groupActive = activeGroupId === group.id;
            const GroupIcon = group.icon;
            return (
              <div key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    groupActive
                      ? 'text-primary bg-primary/5'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <GroupIcon size={17} className={groupActive ? 'text-primary' : 'text-slate-400'} />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown
                    size={14}
                    className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}
                  />
                </button>
                {open && (
                  <div className="ml-5 mt-0.5 mb-1 pl-3 border-l-2 border-primary/15 space-y-0.5">
                    {group.items.map((item) => (
                      <NavItem key={item.href} link={item} pathname={pathname} onNavigate={closeMobile} sub />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="pt-3 mt-1 border-t border-border space-y-0.5">
            {SOLO_BOTTOM.map((link) => (
              <NavItem key={link.href} link={link} pathname={pathname} onNavigate={closeMobile} />
            ))}
          </div>
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-border shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white transition-colors">
            <span className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
              EA
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate">Excess Admin</p>
              <p className="text-xs text-slate-400 truncate">HQ Administrator</p>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={toggleDark}
                title={darkMode ? 'Light mode' : 'Dark mode'}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-md hover:bg-slate-100"
              >
                {darkMode ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="text-slate-400 hover:text-danger transition-colors p-1.5 rounded-md hover:bg-danger/5"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={closeMobile} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 sm:h-16 bg-white border-b border-border flex items-center px-3 sm:px-6 gap-2 sm:gap-3 shrink-0 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <h1 className="text-sm sm:text-base font-semibold text-slate-800 truncate">{pageTitle}</h1>
          <div className="flex-1" />
          {/* Cmd+K trigger */}
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-slate-400 hover:text-slate-600 hover:border-slate-300 text-xs transition-colors bg-slate-50 hover:bg-white"
            aria-label="Open command palette"
          >
            <Search size={13} />
            <span className="text-slate-400">Search…</span>
            <span className="ml-1 flex items-center gap-0.5">
              <kbd className="text-[9px] bg-white border border-slate-200 rounded px-1 py-0.5 leading-none">⌘</kbd>
              <kbd className="text-[9px] bg-white border border-slate-200 rounded px-1 py-0.5 leading-none">K</kbd>
            </span>
          </button>
          <NotificationPanel />
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-success bg-success/10 px-2.5 py-1.5 rounded-full border border-success/20">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Live
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6">{children}</main>
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
        sub ? 'px-3 py-1.5' : 'px-3 py-2.5 font-medium'
      } ${
        active
          ? 'bg-primary text-white shadow-sm font-semibold'
          : sub
          ? 'text-slate-500 hover:text-primary hover:bg-primary/5'
          : 'text-slate-600 hover:text-primary hover:bg-primary/5'
      }`}
    >
      <Icon size={sub ? 15 : 17} className={active ? 'text-white' : ''} />
      <span className="truncate">{link.label}</span>
    </Link>
  );
}
