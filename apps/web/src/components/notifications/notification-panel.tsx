'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { Bell, X, CheckCheck, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
  useDismissNotification,
} from '@/hooks/use-notifications';

const TYPE_DOT: Record<string, string> = {
  'lead.assigned':      'bg-primary',
  'lead.stage_changed': 'bg-accent',
  'lead.converted':     'bg-success',
  'ticket.created':     'bg-danger',
  'ticket.updated':     'bg-warning',
  'appointment.today':  'bg-sky-500',
  'commission.approved':'bg-success',
  'amc.expiring':       'bg-amber-500',
};

export function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { data } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const dismiss = useDismissNotification();

  const notifications = data?.data ?? [];
  const unreadCount = data?.meta?.unreadCount ?? 0;

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleOpen() {
    setOpen((v) => !v);
  }

  function handleClickNotification(id: string, isRead: boolean) {
    if (!isRead) markRead.mutate(id);
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell trigger */}
      <button
        type="button"
        aria-label="Notifications"
        onClick={handleOpen}
        className="relative text-slate-400 hover:text-slate-700 transition-colors"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-8 z-50 w-80 rounded-xl border border-border bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-primary transition-colors"
                >
                  <CheckCheck size={12} />
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Bell size={28} className="mb-2 text-slate-200" />
                <p className="text-xs text-slate-400">You&apos;re all caught up!</p>
              </div>
            ) : (
              notifications.map((n) => {
                const dot = TYPE_DOT[n.type] ?? 'bg-slate-400';
                const content = (
                  <div
                    className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 ${
                      n.isRead ? '' : 'bg-primary/[0.03]'
                    }`}
                    onClick={() => handleClickNotification(n.id, n.isRead)}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot} ${n.isRead ? 'opacity-30' : ''}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${n.isRead ? 'text-slate-500' : 'font-medium text-slate-800'}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{n.body}</p>
                      )}
                      <p className="mt-1 text-[10px] text-slate-400">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); dismiss.mutate(n.id); }}
                      className="mt-0.5 shrink-0 text-slate-300 hover:text-slate-500 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                );

                return n.linkHref ? (
                  <Link key={n.id} href={n.linkHref} onClick={() => { setOpen(false); handleClickNotification(n.id, n.isRead); }}>
                    {content}
                  </Link>
                ) : (
                  <div key={n.id}>{content}</div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-border px-4 py-2.5 text-center">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                View all notifications <ExternalLink size={11} />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
