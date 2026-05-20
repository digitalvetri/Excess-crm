'use client';

import { useState } from 'react';
import type React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  PhoneCall,
  MessageSquare,
  Calendar,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Building2,
  DollarSign,
  FileText,
  BookOpen,
  Trophy,
  UserPlus,
  Star,
  Wallet,
  Hammer,
  Wrench,
  Megaphone,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

const NAV: { href: string; label: string; icon: React.ElementType }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/calls', label: 'Calls', icon: PhoneCall },
  { href: '/quotations', label: 'Quotations', icon: FileText },
  { href: '/projects', label: 'Projects', icon: Hammer },
  { href: '/service-tickets', label: 'Service Tickets', icon: Wrench },
  { href: '/knowledge-base', label: 'Knowledge Base', icon: BookOpen },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/referrals', label: 'Referrals', icon: UserPlus },
  { href: '/reviews', label: 'Reviews', icon: Star },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { href: '/broadcasts', label: 'Broadcasts', icon: Megaphone },
  { href: '/appointments', label: 'Appointments', icon: Calendar },
  { href: '/teams', label: 'Teams', icon: Users },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/insights', label: 'Insights', icon: Sparkles },
  { href: '/franchise', label: 'Franchise', icon: Building2 },
  { href: '/commissions', label: 'Commissions', icon: DollarSign },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    await api.post('/auth/logout');
    router.push('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-border flex flex-col transform transition-transform lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-border">
          <span className="text-lg font-bold text-primary">Excess CRM</span>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors ${
                  active
                    ? 'bg-primary text-white'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-border flex items-center px-6 gap-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden">
            <Menu size={20} className="text-slate-500" />
          </button>
          <div className="flex-1" />
          <button className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-xs">
              U
            </span>
            <ChevronDown size={14} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
