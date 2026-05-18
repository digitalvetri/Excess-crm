'use client';

import { useState, useRef, useEffect } from 'react';
import { useConversations, useMessages, useSendMessage } from '@/hooks/use-whatsapp';

export default function WhatsAppPage() {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sendErr, setSendErr] = useState<string | null>(null);

  const { conversations, loading: convsLoading, error: convsError } = useConversations();
  const { messages, loading: msgsLoading, error: msgsError } = useMessages(selectedLeadId);
  const { send, loading: sending } = useSendMessage();

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!selectedLeadId || !draft.trim()) return;
    setSendErr(null);
    try {
      await send(selectedLeadId, draft.trim());
      setDraft('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send';
      setSendErr(msg);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const selectedConv = conversations.find((c) => c.leadId === selectedLeadId);

  return (
    <div className="flex h-full gap-0 rounded-xl overflow-hidden border border-border bg-white">
      {/* Left panel — conversation list */}
      <aside className="w-1/3 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-slate-900">WhatsApp</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {convsLoading ? (
            <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>
          ) : convsError ? (
            <p className="px-4 py-6 text-sm text-red-600">{convsError}</p>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No conversations</p>
          ) : (
            conversations.map((conv) => {
              const active = conv.leadId === selectedLeadId;
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedLeadId(conv.leadId)}
                  className={`w-full text-left px-4 py-3 border-b border-border transition-colors ${
                    active ? 'bg-primary/5' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-slate-900 truncate">
                      {conv.lead?.name ?? conv.phone}
                    </span>
                    <span className="text-xs text-slate-400 ml-2 whitespace-nowrap">
                      {new Date(conv.lastMessageAt).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{conv.phone}</div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Right panel — message thread */}
      <div className="flex-1 flex flex-col">
        {selectedLeadId === null ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Select a conversation
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-4 py-3 border-b border-border">
              <div className="font-semibold text-slate-900 text-sm">
                {selectedConv?.lead?.name ?? selectedConv?.phone ?? selectedLeadId}
              </div>
              {selectedConv?.lead?.stage && (
                <div className="text-xs text-slate-500 mt-0.5">{selectedConv.lead.stage}</div>
              )}
            </div>

            {/* Messages */}
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
                  const isAi = msg.actorIsAi;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isAi ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-3 py-2 rounded-xl text-sm ${
                          isAi
                            ? 'bg-blue-500 text-white rounded-br-none'
                            : 'bg-slate-100 text-slate-800 rounded-bl-none'
                        }`}
                      >
                        <p>{text}</p>
                        <p
                          className={`text-xs mt-1 ${isAi ? 'text-blue-100' : 'text-slate-400'}`}
                        >
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

            {/* Input bar */}
            <div className="px-4 py-3 border-t border-border space-y-2">
              {sendErr && <p className="text-xs text-red-600">{sendErr}</p>}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message…"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={sending || !draft.trim()}
                  className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-60 whitespace-nowrap"
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
