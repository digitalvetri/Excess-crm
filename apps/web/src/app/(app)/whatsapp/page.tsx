'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, WifiOff, Settings, X, Copy, Eye, EyeOff, Loader2, Wifi, MessageSquare, Search, ExternalLink, Clock } from 'lucide-react';
import {
  useConversations,
  useMessages,
  useSendMessage,
  useWhatsappConfig,
  useSaveWhatsappConfig,
  useDisconnectWhatsapp,
} from '@/hooks/use-whatsapp';
import { getApiErrorMessage } from '@/lib/api-error';
import { useAuth } from '@/hooks/use-auth';

// ─── Connection panel ────────────────────────────────────────────────────────

function WhatsappConnectPanel({ onClose }: { onClose: () => void }) {
  const { data: config, isLoading } = useWhatsappConfig();
  const save       = useSaveWhatsappConfig();
  const disconnect = useDisconnectWhatsapp();

  const [phoneNumberId,     setPhoneNumberId]     = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [accessToken,       setAccessToken]       = useState('');
  const [displayName,       setDisplayName]       = useState('');
  const [showToken,         setShowToken]         = useState(false);
  const [copied,            setCopied]            = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setPhoneNumberId(config.phoneNumberId ?? '');
      setBusinessAccountId(config.businessAccountId ?? '');
      setDisplayName(config.displayName ?? '');
    }
  }, [config]);

  function copyToClipboard(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  async function handleSave() {
    if (!phoneNumberId || !businessAccountId || !accessToken) {
      toast.error('Phone Number ID, Business Account ID and Access Token are required');
      return;
    }
    try {
      await save.mutateAsync({ phoneNumberId, businessAccountId, accessToken, ...(displayName ? { displayName } : {}) });
      toast.success('WhatsApp connected successfully');
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to connect — check your credentials'));
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect WhatsApp? Broadcasts and messaging will stop working.')) return;
    try {
      await disconnect.mutateAsync();
      toast.success('WhatsApp disconnected');
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to disconnect'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Wifi size={16} className="text-emerald-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">WhatsApp Business</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 size={24} className="animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Current status */}
            {config?.isConnected && (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-emerald-800">
                    Connected{config.displayName ? ` — ${config.displayName}` : ''}
                  </p>
                  <p className="text-emerald-600 text-xs mt-0.5">Phone ID: {config.phoneNumberId}</p>
                </div>
              </div>
            )}

            {/* Webhook info (read-only, shown when connected) */}
            {config?.isConnected && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Webhook settings (paste into Meta Developer Console)</p>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Callback URL</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-slate-50 border border-border rounded-lg px-3 py-2 text-slate-700 truncate">
                      {config.webhookUrl}
                    </code>
                    <button
                      onClick={() => copyToClipboard(config.webhookUrl, 'url')}
                      className="text-slate-400 hover:text-primary transition-colors shrink-0"
                    >
                      {copied === 'url' ? <CheckCircle2 size={15} className="text-success" /> : <Copy size={15} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Verify Token</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-slate-50 border border-border rounded-lg px-3 py-2 text-slate-700 truncate">
                      {config.webhookVerifyToken}
                    </code>
                    <button
                      onClick={() => copyToClipboard(config.webhookVerifyToken, 'token')}
                      className="text-slate-400 hover:text-primary transition-colors shrink-0"
                    >
                      {copied === 'token' ? <CheckCircle2 size={15} className="text-success" /> : <Copy size={15} />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Credential form */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {config?.isConnected ? 'Update credentials' : 'Enter your WhatsApp Business credentials'}
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number ID</label>
                <input
                  type="text"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="e.g. 102345678901234"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <p className="text-[11px] text-slate-400 mt-1">Meta Developer Console → WhatsApp → Phone Numbers</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Business Account ID (WABA ID)</label>
                <input
                  type="text"
                  value={businessAccountId}
                  onChange={(e) => setBusinessAccountId(e.target.value)}
                  placeholder="e.g. 103456789012345"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <p className="text-[11px] text-slate-400 mt-1">Meta Business Manager → Business Settings → WhatsApp Accounts</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Access Token {config?.isConnected && config.hasToken && <span className="text-emerald-600 font-normal">(saved — enter new to replace)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder={config?.isConnected && config.hasToken ? '••••••••••• (unchanged)' : 'Permanent token from Meta Developer Console'}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Display Name (optional)</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Excess Renew Solar"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            {/* Setup guide link */}
            {!config?.isConnected && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
                <p className="font-medium">How to get these credentials:</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-600">
                  <li>Go to Meta Developer Console → Create or open your app</li>
                  <li>Add the WhatsApp product to your app</li>
                  <li>Under WhatsApp → Phone Numbers, copy the Phone Number ID</li>
                  <li>Under WhatsApp → Configuration, copy the Access Token</li>
                  <li>Save here — the webhook URL and verify token will appear automatically</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          {config?.isConnected ? (
            <button
              onClick={() => void handleDisconnect()}
              disabled={disconnect.isPending}
              className="text-sm text-danger hover:text-danger/80 transition-colors"
            >
              {disconnect.isPending ? 'Disconnecting…' : 'Disconnect WhatsApp'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={save.isPending || (!accessToken && !config?.isConnected)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {save.isPending && <Loader2 size={14} className="animate-spin" />}
              {config?.isConnected ? 'Update' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main WhatsApp page ───────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [draft, setDraft]                   = useState('');
  const [sendErr, setSendErr]               = useState<string | null>(null);
  const [showConnect, setShowConnect]       = useState(false);
  const [search, setSearch]                 = useState('');

  const { data: config }                                                            = useWhatsappConfig();
  const { conversations, loading: convsLoading, error: convsError, refetch: refetchConvs } = useConversations();
  const { messages, loading: msgsLoading, error: msgsError, refetch: refetchMsgs } = useMessages(selectedLeadId);
  const { send, loading: sending }                                                  = useSendMessage();

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const id = setInterval(() => {
      if (selectedLeadId) refetchMsgs();
      else refetchConvs();
    }, 10_000);
    return () => clearInterval(id);
  }, [selectedLeadId, refetchMsgs, refetchConvs]);

  async function handleSend() {
    if (!selectedLeadId || !draft.trim()) return;
    setSendErr(null);
    try {
      await send(selectedLeadId, draft.trim());
      setDraft('');
    } catch (err: unknown) {
      setSendErr(err instanceof Error ? err.message : 'Failed to send');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const selectedConv = conversations.find((c) => c.leadId === selectedLeadId);
  const filteredConvs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) => (c.lead?.name ?? '').toLowerCase().includes(q) || c.phone.toLowerCase().includes(q),
    );
  }, [conversations, search]);
  // 24-hour WhatsApp session window: free-text is only deliverable while it's open.
  const windowOpen = selectedConv ? new Date(selectedConv.sessionExpiresAt).getTime() > Date.now() : true;
  const isConnected  = config?.isConnected ?? false;
  // Saving WhatsApp credentials is integrations.write (ADMIN-only); employees can use
  // a connected number but can't connect/manage it. Don't show them a form that 403s.
  const { role }   = useAuth();
  const canManage  = role === 'ADMIN';

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Connection status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <CheckCircle2 size={15} className="text-emerald-500" />
              <span className="text-sm text-slate-700 font-medium">
                {config?.displayName ?? 'WhatsApp Business'} connected
              </span>
              <span className="text-xs text-slate-400">· {config?.phoneNumberId}</span>
            </>
          ) : (
            <>
              <WifiOff size={15} className="text-amber-500" />
              <span className="text-sm text-amber-700 font-medium">WhatsApp not connected</span>
              <span className="text-xs text-slate-400">— connect to send and receive messages</span>
            </>
          )}
        </div>
        {canManage ? (
          <button
            onClick={() => setShowConnect(true)}
            className="inline-flex items-center gap-1.5 text-sm border border-border px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Settings size={13} />
            {isConnected ? 'Manage' : 'Connect WhatsApp'}
          </button>
        ) : !isConnected ? (
          <span className="text-xs text-slate-400">Ask an administrator to connect WhatsApp</span>
        ) : null}
      </div>

      {/* Connect modal */}
      {showConnect && <WhatsappConnectPanel onClose={() => setShowConnect(false)} />}


      {/* Not connected — full setup prompt, hide chat */}
      {!isConnected && (
        <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white p-12 text-center">
          <div className="h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
            <MessageSquare size={32} className="text-emerald-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 mb-2">Connect WhatsApp Business</h3>
          <p className="text-sm text-slate-500 max-w-sm mb-6">
            Link your WhatsApp Business API to send broadcasts, reply to customer messages, and manage conversations — all from this CRM.
          </p>
          <button
            onClick={() => setShowConnect(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Settings size={14} /> Connect WhatsApp Business
          </button>
          <p className="text-xs text-slate-400 mt-4">You&apos;ll need a Meta Developer account and WhatsApp Business number.</p>
        </div>
      )}

      {/* Chat UI — only shown when connected */}
      {isConnected && <div className="flex-1 flex gap-0 rounded-xl overflow-hidden border border-border bg-white min-h-0">
        {/* Left panel — conversation list */}
        <aside className="w-1/3 border-r border-border flex flex-col">
          <div className="px-4 py-3 border-b border-border space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">Conversations</h2>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or number…"
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convsLoading ? (
              <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>
            ) : convsError ? (
              <p className="px-4 py-6 text-sm text-red-600">{convsError}</p>
            ) : filteredConvs.length === 0 ? (
              <p className="px-4 py-8 text-sm text-slate-400 text-center">
                {conversations.length === 0
                  ? isConnected ? 'No conversations yet' : 'Connect WhatsApp to see conversations'
                  : 'No conversations match your search'}
              </p>
            ) : (
              filteredConvs.map((conv) => {
                const active = conv.leadId === selectedLeadId;
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedLeadId(conv.leadId)}
                    className={`w-full text-left px-4 py-3 border-b border-border transition-colors ${
                      active ? 'bg-primary/5' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm text-slate-900 truncate">
                        {conv.lead?.name ?? conv.phone}
                      </span>
                      <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">
                        {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      {conv.lastMessagePreview?.trim() || conv.phone}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right panel — message thread */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedLeadId === null ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
              <p className="text-sm">Select a conversation</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 text-sm truncate">
                    {selectedConv?.lead?.name ?? selectedConv?.phone ?? selectedLeadId}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {selectedConv?.lead?.stage && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {selectedConv.lead.stage.replace('_', ' ').toLowerCase()}
                      </span>
                    )}
                    {typeof selectedConv?.lead?.aiScore === 'number' && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        Score {selectedConv.lead.aiScore}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">{selectedConv?.phone}</span>
                  </div>
                </div>
                <Link
                  href={`/leads/${selectedLeadId}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Open lead <ExternalLink size={12} />
                </Link>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgsLoading ? (
                  <p className="text-sm text-slate-500">Loading…</p>
                ) : msgsError ? (
                  <p className="text-sm text-red-600">{msgsError}</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center mt-8">No messages yet</p>
                ) : (
                  messages.map((msg) => {
                    const text =
                      (msg.payload.message as string | undefined) ??
                      (msg.payload.template as string | undefined) ??
                      '[message]';
                    const isOutbound =
                      (msg.payload.direction as string | undefined) === 'outbound' ||
                      (!msg.payload.direction && msg.actorIsAi);
                    return (
                      <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-xs lg:max-w-md px-3 py-2 rounded-xl text-sm ${
                            isOutbound
                              ? 'bg-blue-500 text-white rounded-br-none'
                              : 'bg-slate-100 text-slate-800 rounded-bl-none'
                          }`}
                        >
                          <p>{text}</p>
                          <p className={`text-xs mt-1 ${isOutbound ? 'text-blue-100' : 'text-slate-400'}`}>
                            {new Date(msg.createdAt).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <div className="px-4 py-3 border-t border-border space-y-2">
                {!windowOpen && (
                  <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                    <Clock size={13} className="mt-0.5 shrink-0" />
                    <span>The 24-hour window has closed — free-text replies may not be delivered. Use an approved template to re-engage.</span>
                  </div>
                )}
                {sendErr && <p className="text-xs text-red-600">{sendErr}</p>}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message…"
                    disabled={!isConnected}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:bg-slate-50 disabled:cursor-not-allowed"
                  />
                  <button
                    onClick={() => void handleSend()}
                    disabled={sending || !draft.trim() || !isConnected}
                    className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-60 whitespace-nowrap"
                  >
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>}
    </div>
  );
}
