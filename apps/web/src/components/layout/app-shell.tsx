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
  Zap,
  Workflow,
  Webhook,
  FlaskConical,
} from 'lucide-react';
import { api } from '@/lib/api';
import { CommandPalette } from '@/components/command-palette';
import { useAuth } from '@/hooks/use-auth';
import type { UserRole } from '@excess/shared';

interface NavLink {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: UserRole[]; // undefined = all roles
}
interface NavGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  roles?: UserRole[]; // undefined = all roles; hides entire group if role not included
  items: NavLink[];
}

const SOLO_TOP: NavLink = { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard };

const GROUPS: NavGroup[] = [
  {
    id: 'sales',
    label: 'Sales',
    icon: Briefcase,
    roles: ['ADMIN', 'EMPLOYEE'],
    items: [
      { href: '/leads',        label: 'Leads',        icon: Users },
      { href: '/calls',        label: 'Calls',        icon: PhoneCall },
      { href: '/appointments', label: 'Appointments', icon: Calendar },
      { href: '/quotations',   label: 'Quotations',   icon: FileText },
    ],
  },
  {
    id: 'franchise-leads',
    label: 'My Leads',
    icon: Users,
    roles: ['FRANCHISE_OWNER', 'FRANCHISE_USER'],
    items: [
      { href: '/leads',       label: 'My Leads',    icon: Users },
      { href: '/referrals',   label: 'Referrals',   icon: UserPlus, roles: ['FRANCHISE_USER'] },
      { href: '/leaderboard', label: 'Leaderboard', icon: Trophy,   roles: ['FRANCHISE_USER'] },
    ],
  },
  {
    id: 'delivery',
    label: 'Delivery',
    icon: PackageCheck,
    roles: ['ADMIN', 'EMPLOYEE'],
    items: [
      { href: '/projects',        label: 'Projects',        icon: Hammer },
      { href: '/projects/upsell', label: 'Upsell Pipeline', icon: Zap },
      { href: '/service-tickets', label: 'Service Tickets', icon: Wrench },
      { href: '/amc',             label: 'AMC Contracts',   icon: ClipboardList },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: Radio,
    roles: ['ADMIN', 'EMPLOYEE'],
    items: [
      { href: '/whatsapp',   label: 'WhatsApp',   icon: MessageSquare },
      { href: '/broadcasts', label: 'Broadcasts', icon: Megaphone },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    roles: ['ADMIN', 'EMPLOYEE'],
    items: [
      { href: '/reports',  label: 'Reports',  icon: BarChart3 },
      { href: '/insights', label: 'Insights', icon: Sparkles },
    ],
  },
  {
    id: 'voice-agent',
    label: 'Voice Agent',
    icon: Bot,
    roles: ['ADMIN'],
    items: [
      { href: '/voice-agent/playground',  label: 'Playground',  icon: FlaskConical },
      { href: '/voice-agent/personas',   label: 'Personas',    icon: PhoneCall },
      { href: '/voice-agent/monitor',    label: 'Monitor',     icon: Radio },
      { href: '/voice-agent/ab-testing', label: 'A/B Testing', icon: Shuffle },
      { href: '/voice-agent/settings',   label: 'Settings',    icon: Settings },
    ],
  },
  {
    id: 'earnings',
    label: 'My Earnings',
    icon: DollarSign,
    roles: ['FRANCHISE_OWNER'],
    items: [
      { href: '/commissions', label: 'Commissions', icon: DollarSign },
      { href: '/wallet',      label: 'Wallet',      icon: Wallet },
      { href: '/referrals',   label: 'Referrals',   icon: UserPlus },
      { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    ],
  },
  {
    id: 'franchise',
    label: 'Franchise',
    icon: Building2,
    roles: ['ADMIN'],
    items: [
      { href: '/franchise',   label: 'Franchises',   icon: Building2 },
      { href: '/commissions', label: 'Commissions',  icon: DollarSign },
      { href: '/payouts',     label: 'Payouts',      icon: Banknote },
      { href: '/teams',       label: 'Teams',        icon: Users },
    ],
  },
  {
    id: 'engagement',
    label: 'Engagement',
    icon: Network,
    roles: ['ADMIN', 'EMPLOYEE'],
    items: [
      { href: '/engagement',  label: 'Engagement Hub', icon: Network },
      { href: '/referrals',   label: 'Referrals',      icon: UserPlus },
      { href: '/leaderboard', label: 'Leaderboard',    icon: Trophy },
      { href: '/reviews',     label: 'Reviews',        icon: Star },
    ],
  },
  {
    id: 'people',
    label: 'People',
    icon: Users,
    roles: ['ADMIN'],
    items: [
      { href: '/settings/users', label: 'User Management', icon: Users },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    roles: ['ADMIN'],
    items: [
      { href: '/settings/sla-rules',        label: 'SLA Rules',         icon: Timer },
      { href: '/settings/assignment-rules', label: 'Assignment Rules',  icon: Shuffle },
      { href: '/settings/stage-gates',      label: 'Stage Gates',       icon: Shield },
      { href: '/settings/sequences',        label: 'Drip Sequences',    icon: Workflow },
      { href: '/settings/webhooks',         label: 'Webhooks',          icon: Webhook },
    ],
  },
];

const SOLO_BOTTOM: NavLink[] = [
  { href: '/knowledge-base', label: 'Knowledge Base', icon: BookOpen },
];

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN:           'HQ Administrator',
  EMPLOYEE:        'Employee',
  FRANCHISE_OWNER: 'Franchise Owner',
  FRANCHISE_USER:  'Franchise Staff',
  ENGINEER:        'Field Engineer',
};

function filterGroups(groups: NavGroup[], role: UserRole | null): NavGroup[] {
  if (!role) return [];
  return groups
    .filter((g) => !g.roles || g.roles.includes(role))
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
    }))
    .filter((g) => g.items.length > 0);
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

const NAV_STORAGE_KEY = 'excess.nav.groups';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, clearCache } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState(false);

  const visibleGroups = filterGroups(GROUPS, role);
  const allLinks = [SOLO_TOP, ...visibleGroups.flatMap((g) => g.items), ...SOLO_BOTTOM];

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

  const activeGroupId = visibleGroups.find((g) => g.items.some((i) => isActive(pathname, i.href)))?.id ?? null;
  const pageTitle = allLinks.find((l) => isActive(pathname, l.href))?.label ?? 'Excess CRM';

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
    try {
      await api.post('/auth/logout');
      clearCache();
      router.push('/login');
    } catch {
      // Session invalid or API unreachable — clear httpOnly cookies via server-side
      // route, then redirect. Avoids middleware bouncing /login → /dashboard.
      await fetch('/api/auth/clear');
      window.location.href = '/login';
    }
  }

  const closeMobile = () => setSidebarOpen(false);

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'EA';

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

          {/* Show skeleton bars while auth is resolving so nav never looks blank */}
          {visibleGroups.length === 0 && (
            <div className="pt-4 space-y-1 px-1">
              <div className="h-2 w-16 bg-slate-100 rounded mb-3" />
              {[80, 64, 72, 80, 64].map((w, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                  <div className="w-4 h-4 rounded bg-slate-100 shrink-0" />
                  <div className={`h-3 bg-slate-100 rounded`} style={{ width: w }} />
                </div>
              ))}
            </div>
          )}

          {visibleGroups.length > 0 && (
            <div className="pt-4 pb-1 px-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Modules</p>
            </div>
          )}

          {visibleGroups.map((group) => {
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
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {user?.name ?? 'Loading…'}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {role ? ROLE_LABELS[role] : ''}
              </p>
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
