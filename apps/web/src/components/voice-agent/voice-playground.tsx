'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Send, RotateCcw, ChevronDown, ChevronRight, Loader2, Bot, User, Wrench, AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type PersonaId = 'RESHMA_VERIFY' | 'KARTHIK_SALES' | 'RESHMA_FOLLOWUP';

interface HistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  error?: string;
}

interface SimulatedLead {
  name: string;
  phone: string;
  city: string;
  stage: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PERSONAS: Array<{ id: PersonaId; label: string; description: string; color: string }> = [
  { id: 'RESHMA_VERIFY', label: 'Reshma — Verify', description: 'Initial lead qualification', color: 'text-violet-600 bg-violet-50 border-violet-200' },
  { id: 'KARTHIK_SALES', label: 'Karthik — Sales', description: 'Qualified lead conversion', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { id: 'RESHMA_FOLLOWUP', label: 'Reshma — Follow-up', description: 'Scheduled follow-ups', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
];

const STAGES = ['NEW', 'QUALIFIED', 'FOLLOW_UP', 'NOT_ANSWERED', 'CONVERTED', 'INVALID', 'WRONG_ENQUIRY'];

// ─── ToolCallCard ─────────────────────────────────────────────────────────────

function ToolCallCard({ tc }: { tc: ToolCall }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-amber-700 hover:text-amber-900"
      >
        <Wrench size={12} className="shrink-0" />
        <span className="font-mono font-semibold">{tc.name}</span>
        <span className="flex-1 text-left text-amber-500 truncate">
          ({Object.entries(tc.args).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')})
        </span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-amber-200">
          <div>
            <p className="text-amber-500 font-semibold uppercase tracking-wide text-[10px] mt-2 mb-1">Args</p>
            <pre className="bg-amber-100 rounded p-2 text-amber-800 overflow-x-auto text-[11px]">
              {JSON.stringify(tc.args, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-amber-500 font-semibold uppercase tracking-wide text-[10px] mb-1">Result</p>
            <pre className="bg-amber-100 rounded p-2 text-amber-800 overflow-x-auto text-[11px]">
              {JSON.stringify(tc.result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'
      }`}>
        {isUser ? <User size={15} /> : <Bot size={15} />}
      </div>
      <div className={`max-w-[78%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary text-white rounded-tr-sm'
            : msg.error
            ? 'bg-red-50 border border-red-200 text-red-700 rounded-tl-sm'
            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'
        }`}>
          {msg.error ? (
            <div className="flex items-center gap-2">
              <AlertCircle size={14} />
              <span>{msg.error}</span>
            </div>
          ) : (
            msg.content
          )}
        </div>
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="w-full">
            {msg.toolCalls.map((tc, i) => <ToolCallCard key={i} tc={tc} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VoicePlayground() {
  const [personaId, setPersonaId] = useState<PersonaId>('RESHMA_VERIFY');
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lead, setLead] = useState<SimulatedLead>({
    name: 'Rajesh Kumar',
    phone: '+91 9876543210',
    city: 'Coimbatore',
    stage: 'NEW',
  });
  const [leadOpen, setLeadOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleClear() {
    setMessages([]);
    setHistory([]);
    setInput('');
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsgId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: userMsgId, role: 'user', content: text }]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/api/v1/voice-agent/playground/chat', {
        personaId,
        message: text,
        history,
        simulatedLead: lead,
      });

      const { reply, toolCalls, newHistory } = res.data.data as {
        reply: string;
        toolCalls: ToolCall[];
        newHistory: HistoryItem[];
      };

      setHistory(newHistory);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: reply, toolCalls },
      ]);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        ?? 'Failed to get response. Check GROQ_API_KEY is configured.';
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: '', error: msg },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const activePersona = PERSONAS.find((p) => p.id === personaId)!;

  return (
    <div className="flex flex-col gap-5">
      {/* Persona selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PERSONAS.map((p) => (
          <button
            key={p.id}
            onClick={() => { setPersonaId(p.id); handleClear(); }}
            className={`text-left rounded-xl border-2 px-4 py-3 transition-all ${
              personaId === p.id
                ? `${p.color} border-current shadow-sm`
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <p className="font-semibold text-sm">{p.label}</p>
            <p className="text-xs mt-0.5 opacity-70">{p.description}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Chat panel */}
        <div className="flex-1 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden min-h-[500px]">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <Bot size={16} className="text-primary" />
              <span className="text-sm font-semibold text-slate-700">{activePersona.label}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${activePersona.color}`}>
                Playground
              </span>
            </div>
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded hover:bg-slate-100"
            >
              <RotateCcw size={12} />
              Clear
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-12 text-slate-400">
                <Bot size={40} className="mb-3 text-slate-200" />
                <p className="text-sm font-medium">Start a conversation</p>
                <p className="text-xs mt-1 max-w-xs">
                  Type a message as if you were a customer. The agent will respond using the active system prompt for {activePersona.label}.
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                  <Loader2 size={15} className="text-slate-400 animate-spin" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-100 p-3 bg-white">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message as customer… (Enter to send, Shift+Enter for newline)`}
                rows={2}
                disabled={loading}
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 disabled:opacity-50 transition"
              />
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || loading}
                className="shrink-0 w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 px-1">
              No outbound calls — tool calls are simulated. Uses Groq / Llama-3.3-70b.
            </p>
          </div>
        </div>

        {/* Simulated lead panel */}
        <div className="lg:w-64 shrink-0">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button
              onClick={() => setLeadOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 border-b border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              Simulated Lead
              {leadOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
            </button>
            {(leadOpen || true) && (
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Name</label>
                  <input
                    value={lead.name}
                    onChange={(e) => setLead((l) => ({ ...l, name: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Phone</label>
                  <input
                    value={lead.phone}
                    onChange={(e) => setLead((l) => ({ ...l, phone: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">City</label>
                  <input
                    value={lead.city}
                    onChange={(e) => setLead((l) => ({ ...l, city: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Stage</label>
                  <select
                    value={lead.stage}
                    onChange={(e) => setLead((l) => ({ ...l, stage: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 bg-white"
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] text-slate-400 pt-1 leading-relaxed">
                  These values are passed to the agent via <code className="font-mono bg-slate-100 px-1 rounded">getLeadInfo</code> when called. Changes take effect on next message.
                </p>
              </div>
            )}
          </div>

          {/* Tip box */}
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-semibold text-blue-700 mb-2">Tips</p>
            <ul className="text-xs text-blue-600 space-y-1.5 list-disc list-inside">
              <li>Ask about pricing, subsidies, or ROI</li>
              <li>Say you&apos;re not interested to test stage transitions</li>
              <li>Request an appointment (Karthik persona)</li>
              <li>Tool calls expand to show args + simulated results</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
