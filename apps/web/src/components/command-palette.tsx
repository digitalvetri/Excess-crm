'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  LayoutDashboard, Users, PhoneCall, Calendar, FileText, Hammer,
  Wrench, MessageSquare, Megaphone, BarChart3, Sparkles, Building2,
  DollarSign, Banknote, Trophy, BookOpen, Settings, Bot, Timer,
  Shuffle, Shield, Workflow, Webhook, Search, PackageCheck, Radio,
  Network, ClipboardList,
} from 'lucide-react';
import { api } from '@/lib/api';

interface NavResult {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  group: string;
}

interface LeadResult {
  id: string;
  name: string;
  phone: string;
  stage: string;
}

const NAV_ITEMS: NavResult[] = [
  { id: 'dashboard',        label: 'Dashboard',        href: '/dashboard',              icon: LayoutDashboard, group: 'Navigate' },
  { id: 'leads',            label: 'Leads',            href: '/leads',                  icon: Users,           group: 'Navigate' },
  { id: 'calls',            label: 'Calls',            href: '/calls',                  icon: PhoneCall,       group: 'Navigate' },
  { id: 'appointments',     label: 'Appointments',     href: '/appointments',           icon: Calendar,        group: 'Navigate' },
  { id: 'quotations',       label: 'Quotations',       href: '/quotations',             icon: FileText,        group: 'Navigate' },
  { id: 'projects',         label: 'Projects',         href: '/projects',               icon: Hammer,          group: 'Navigate' },
  { id: 'service-tickets',  label: 'Service Tickets',  href: '/service-tickets',        icon: Wrench,          group: 'Navigate' },
  { id: 'amc',              label: 'AMC Contracts',    href: '/amc',                    icon: ClipboardList,   group: 'Navigate' },
  { id: 'whatsapp',         label: 'WhatsApp',         href: '/whatsapp',               icon: MessageSquare,   group: 'Navigate' },
  { id: 'broadcasts',       label: 'Broadcasts',       href: '/broadcasts',             icon: Megaphone,       group: 'Navigate' },
  { id: 'reports',          label: 'Reports',          href: '/reports',                icon: BarChart3,       group: 'Navigate' },
  { id: 'insights',         label: 'Insights',         href: '/insights',               icon: Sparkles,        group: 'Navigate' },
  { id: 'franchise',        label: 'Franchises',       href: '/franchise',              icon: Building2,       group: 'Navigate' },
  { id: 'commissions',      label: 'Commissions',      href: '/commissions',            icon: DollarSign,      group: 'Navigate' },
  { id: 'payouts',          label: 'Payouts',          href: '/payouts',                icon: Banknote,        group: 'Navigate' },
  { id: 'engagement',       label: 'Engagement Hub',   href: '/engagement',             icon: Network,         group: 'Navigate' },
  { id: 'leaderboard',      label: 'Leaderboard',      href: '/engagement?tab=leaderboard', icon: Trophy,     group: 'Navigate' },
  { id: 'knowledge-base',   label: 'Knowledge Base',   href: '/knowledge-base',         icon: BookOpen,        group: 'Navigate' },
  { id: 'settings',         label: 'Settings',         href: '/settings',               icon: Settings,        group: 'Settings' },
  { id: 'voice-agent',      label: 'Voice Agent',      href: '/settings/voice-agent',   icon: Bot,             group: 'Settings' },
  { id: 'sla-rules',        label: 'SLA Rules',        href: '/settings/sla-rules',     icon: Timer,           group: 'Settings' },
  { id: 'assignment-rules', label: 'Assignment Rules', href: '/settings/assignment-rules', icon: Shuffle,      group: 'Settings' },
  { id: 'stage-gates',      label: 'Stage Gates',      href: '/settings/stage-gates',   icon: Shield,          group: 'Settings' },
  { id: 'sequences',        label: 'Drip Sequences',   href: '/settings/sequences',     icon: Workflow,        group: 'Settings' },
  { id: 'webhooks',         label: 'Webhooks',         href: '/settings/webhooks',      icon: Webhook,         group: 'Settings' },
];

const STAGE_COLOR: Record<string, string> = {
  NEW: 'text-slate-500',
  QUALIFIED: 'text-blue-600',
  FOLLOW_UP: 'text-amber-600',
  CONVERTED: 'text-green-600',
  NOT_ANSWERED: 'text-orange-500',
  INVALID: 'text-red-500',
  WRONG_ENQUIRY: 'text-red-500',
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState<LeadResult[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);

  // Open on Cmd+K / Ctrl+K
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Search leads when query changes
  const searchLeads = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setLeads([]); return; }
    setLeadsLoading(true);
    try {
      const res = await api.get<{ data: { leads: LeadResult[] } }>('/leads', {
        params: { search: q, limit: 5 },
      });
      setLeads(res.data?.data?.leads ?? []);
    } catch {
      setLeads([]);
    } finally {
      setLeadsLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void searchLeads(query), 200);
    return () => clearTimeout(t);
  }, [query, searchLeads]);

  function navigate(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  if (!open) return null;

  const filteredNav = NAV_ITEMS.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  );

  const groups = Array.from(new Set(filteredNav.map((i) => i.group)));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-slate-900/50 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl mx-4 bg-white rounded-2xl shadow-2xl border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command Palette" shouldFilter={false}>
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search size={16} className="text-slate-400 shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search pages, leads…"
              className="flex-1 text-sm outline-none bg-transparent text-slate-800 placeholder:text-slate-400"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto">
            <Command.Empty className="py-10 text-center text-sm text-slate-400">
              {leadsLoading ? 'Searching…' : 'No results found.'}
            </Command.Empty>

            {/* Lead results (shown when searching) */}
            {leads.length > 0 && (
              <Command.Group
                heading="Leads"
                className="[&>[cmdk-group-heading]]:px-4 [&>[cmdk-group-heading]]:py-2 [&>[cmdk-group-heading]]:text-[10px] [&>[cmdk-group-heading]]:font-semibold [&>[cmdk-group-heading]]:text-slate-400 [&>[cmdk-group-heading]]:uppercase [&>[cmdk-group-heading]]:tracking-wide"
              >
                {leads.map((lead) => (
                  <Command.Item
                    key={lead.id}
                    value={lead.id}
                    onSelect={() => navigate(`/leads/${lead.id}`)}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer data-[selected=true]:bg-primary/5 data-[selected=true]:text-primary transition-colors"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {lead.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{lead.name}</p>
                      <p className="text-xs text-slate-400 truncate">{lead.phone}</p>
                    </div>
                    <span className={`text-xs font-medium ${STAGE_COLOR[lead.stage] ?? 'text-slate-500'}`}>
                      {lead.stage.replace(/_/g, ' ')}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Navigation items */}
            {groups.map((group) => (
              <Command.Group
                key={group}
                heading={group}
                className="[&>[cmdk-group-heading]]:px-4 [&>[cmdk-group-heading]]:py-2 [&>[cmdk-group-heading]]:text-[10px] [&>[cmdk-group-heading]]:font-semibold [&>[cmdk-group-heading]]:text-slate-400 [&>[cmdk-group-heading]]:uppercase [&>[cmdk-group-heading]]:tracking-wide"
              >
                {filteredNav
                  .filter((i) => i.group === group)
                  .map((item) => {
                    const Icon = item.icon;
                    return (
                      <Command.Item
                        key={item.id}
                        value={item.label}
                        onSelect={() => navigate(item.href)}
                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer data-[selected=true]:bg-primary/5 data-[selected=true]:text-primary transition-colors"
                      >
                        <Icon size={15} className="shrink-0 text-slate-400" />
                        <span className="text-sm text-slate-700">{item.label}</span>
                      </Command.Item>
                    );
                  })}
              </Command.Group>
            ))}
          </Command.List>

          {/* Footer hint */}
          <div className="flex items-center gap-3 px-4 py-2 border-t border-border bg-slate-50">
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <kbd className="bg-white border border-slate-200 rounded px-1 py-0.5">↑↓</kbd> navigate
            </span>
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <kbd className="bg-white border border-slate-200 rounded px-1 py-0.5">↵</kbd> open
            </span>
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <kbd className="bg-white border border-slate-200 rounded px-1 py-0.5">ESC</kbd> close
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}
