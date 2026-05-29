'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, RotateCcw, ChevronDown, ChevronRight, Loader2, Bot, User, Wrench,
  Mic, MicOff, Phone, PhoneOff, Activity, Zap, Volume2, AlertCircle,
  Download,
} from 'lucide-react';
import { Room, RoomEvent, Track, ConnectionState, type RemoteTrack } from 'livekit-client';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type PersonaId = 'RESHMA_VERIFY' | 'KARTHIK_SALES' | 'RESHMA_FOLLOWUP';

interface HistoryItem { role: 'user' | 'assistant'; content: string }
interface ToolCall { name: string; args: Record<string, unknown>; result: unknown }

interface ChatMessage {
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

type CallState = 'idle' | 'connecting' | 'active' | 'ended';

// ─── Constants ────────────────────────────────────────────────────────────────

const PERSONAS: Array<{ id: PersonaId; label: string; short: string }> = [
  { id: 'RESHMA_VERIFY',   label: 'Reshma — Verify',    short: 'Reshma Verify' },
  { id: 'KARTHIK_SALES',   label: 'Karthik — Sales',    short: 'Karthik Sales' },
  { id: 'RESHMA_FOLLOWUP', label: 'Reshma — Follow-up', short: 'Reshma Follow-up' },
];

const STAGES = ['NEW', 'QUALIFIED', 'FOLLOW_UP', 'NOT_ANSWERED', 'CONVERTED', 'INVALID', 'WRONG_ENQUIRY'];

const PIPELINE_BADGES = [
  { label: 'STT', value: 'sarvam', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { label: 'LLM', value: 'groq / llama', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { label: 'TTS', value: 'elevenlabs', color: 'bg-orange-100 text-orange-700 border-orange-200' },
];

// ─── ToolCallCard ─────────────────────────────────────────────────────────────

function ToolCallCard({ tc }: { tc: ToolCall }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-amber-700 hover:bg-amber-100 transition-colors"
      >
        <Wrench size={11} className="shrink-0" />
        <span className="font-mono font-semibold">{tc.name}()</span>
        {open ? <ChevronDown size={11} className="ml-auto" /> : <ChevronRight size={11} className="ml-auto" />}
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1 border-t border-amber-200 space-y-2">
          <pre className="bg-amber-100/60 rounded p-2 overflow-x-auto text-[10px] text-amber-900 leading-relaxed">
            {JSON.stringify({ args: tc.args, result: tc.result }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── VoiceWaveform ────────────────────────────────────────────────────────────

function VoiceWaveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-center justify-center gap-[3px] h-8">
      {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((h, i) => (
        <div
          key={i}
          className={`w-1 rounded-full transition-all ${active ? 'bg-primary' : 'bg-slate-200'}`}
          style={{
            height: active ? `${h * 5 + 4}px` : '4px',
            animation: active ? `pulse 0.8s ease-in-out ${i * 0.08}s infinite alternate` : 'none',
          }}
        />
      ))}
      <style>{`@keyframes pulse { from { transform: scaleY(0.4); } to { transform: scaleY(1); } }`}</style>
    </div>
  );
}

// ─── CallTimer ────────────────────────────────────────────────────────────────

function CallTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startTime]);
  const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  return <span className="tabular-nums">{m}:{s}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VoicePlayground() {
  // Text chat state
  const [personaId, setPersonaId] = useState<PersonaId>('RESHMA_VERIFY');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [lead, setLead] = useState<SimulatedLead>({ name: 'Rajesh Kumar', phone: '+91 9876543210', city: 'Coimbatore', stage: 'NEW' });
  const [leadOpen, setLeadOpen] = useState(false);

  // Voice call state
  const [callState, setCallState] = useState<CallState>('idle');
  const [muted, setMuted] = useState(false);
  const [callStart, setCallStart] = useState(0);
  const [callError, setCallError] = useState<string | null>(null);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        void roomRef.current.disconnect();
        roomRef.current = null;
      }
    };
  }, []);

  // ── Text chat ───────────────────────────────────────────────────────────────

  function clearChat() {
    setMessages([]);
    setHistory([]);
    setInput('');
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || chatLoading || callState === 'active') return;

    setMessages((p) => [...p, { id: crypto.randomUUID(), role: 'user', content: text }]);
    setInput('');
    setChatLoading(true);

    try {
      const res = await api.post('/api/v1/voice-agent/playground/chat', {
        personaId, message: text, history, simulatedLead: lead,
      });
      const { reply, toolCalls, newHistory } = res.data.data as { reply: string; toolCalls: ToolCall[]; newHistory: HistoryItem[] };
      setHistory(newHistory);
      setMessages((p) => [...p, { id: crypto.randomUUID(), role: 'assistant', content: reply, toolCalls }]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'LLM error — check GROQ_API_KEY';
      setMessages((p) => [...p, { id: crypto.randomUUID(), role: 'assistant', content: '', error: msg }]);
    } finally {
      setChatLoading(false);
    }
  }

  function saveTranscript() {
    const lines = messages.map((m) => `${m.role === 'user' ? 'You' : 'Agent'}: ${m.content}`).join('\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `transcript-${personaId}-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Voice call ──────────────────────────────────────────────────────────────

  const startVoiceCall = useCallback(async () => {
    setCallError(null);
    setCallState('connecting');

    try {
      const res = await api.post('/api/v1/voice-agent/playground/voice-room', { personaId });
      const { token, wsUrl } = res.data.data as { token: string; wsUrl: string; roomName: string };

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.autoplay = true;
          audioContainerRef.current?.appendChild(el);
          setAgentSpeaking(true);
          track.on('muted', () => setAgentSpeaking(false));
          track.on('unmuted', () => setAgentSpeaking(true));
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach((el) => el.remove());
          setAgentSpeaking(false);
        }
      });

      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (state === ConnectionState.Connected) {
          setCallState('active');
          setCallStart(Date.now());
        } else if (state === ConnectionState.Disconnected) {
          setCallState('ended');
          setAgentSpeaking(false);
          setTimeout(() => setCallState('idle'), 3000);
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        setCallState('ended');
        setAgentSpeaking(false);
        setTimeout(() => setCallState('idle'), 3000);
      });

      await room.connect(wsUrl, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      roomRef.current = room;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        ?? (err as { message?: string })?.message
        ?? 'Failed to start voice call';
      setCallError(msg);
      setCallState('idle');
    }
  }, [personaId]);

  async function endVoiceCall() {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    // Clean up audio elements
    audioContainerRef.current?.querySelectorAll('audio').forEach((el) => el.remove());
    setCallState('ended');
    setAgentSpeaking(false);
    setTimeout(() => setCallState('idle'), 2000);
  }

  async function toggleMute() {
    if (!roomRef.current) return;
    const next = !muted;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }

  const activePersona = PERSONAS.find((p) => p.id === personaId)!;

  return (
    <div className="flex flex-col gap-5">
      {/* Hidden audio container */}
      <div ref={audioContainerRef} className="hidden" aria-hidden />

      {/* Persona selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Select agent to test:</label>
        <div className="relative">
          <select
            value={personaId}
            onChange={(e) => { setPersonaId(e.target.value as PersonaId); clearChat(); }}
            className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 cursor-pointer shadow-sm"
          >
            {PERSONAS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <div className="flex-1" />
        <button
          onClick={saveTranscript}
          disabled={messages.length === 0}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Download size={13} /> Save Transcript
        </button>
        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <RotateCcw size={13} /> Clear
        </button>
      </div>

      {/* Body: chat + right panel */}
      <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: 540 }}>

        {/* ── Left: Chat transcript ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40" style={{ minHeight: 340 }}>
            {callState === 'active' ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 py-8 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                  <Phone size={32} className="text-primary animate-pulse" />
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-800">Voice call active</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    <CallTimer startTime={callStart} /> — speaking with {activePersona.short}
                  </p>
                </div>
                <VoiceWaveform active={agentSpeaking} />
                <p className="text-xs text-slate-400">
                  {agentSpeaking ? 'Agent is speaking…' : 'Listening for your voice…'}
                </p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12 text-slate-400">
                <Bot size={40} className="mb-3 text-slate-200" />
                <p className="text-sm font-medium text-slate-500">Select an agent above to begin</p>
                <p className="text-xs mt-1 max-w-xs">Pick an agent and type a message, or start a voice call from the panel on the right.</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${msg.role === 'user' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {msg.role === 'user' ? <User size={13} /> : <Bot size={13} />}
                  </div>
                  <div className={`max-w-[80%] flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-sm' : msg.error ? 'bg-red-50 border border-red-200 text-red-700 rounded-tl-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'}`}>
                      {msg.error ? <span className="flex items-center gap-1.5"><AlertCircle size={13} />{msg.error}</span> : msg.content}
                    </div>
                    {msg.toolCalls?.map((tc, i) => <ToolCallCard key={i} tc={tc} />)}
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center"><Loader2 size={13} className="animate-spin text-slate-400" /></div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex gap-1 items-center">
                  {[0, 150, 300].map((d) => <span key={d} className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Text input */}
          <div className="border-t border-slate-100 p-3 bg-white">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                placeholder={callState === 'active' ? 'Voice call active — use voice…' : 'Type a message as the customer… (Enter to send)'}
                rows={2}
                disabled={chatLoading || callState === 'active'}
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 disabled:opacity-50 transition"
              />
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || chatLoading || callState === 'active'}
                className="shrink-0 w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
              >
                {chatLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 px-0.5">
              Live streaming STT · Auto-VAD + Sarvam STT · Hands-free in Voice Call
            </p>
          </div>
        </div>

        {/* ── Right: Pipeline + Voice Call ─────────────────────────────────── */}
        <div className="lg:w-72 shrink-0 flex flex-col gap-3">

          {/* Active Pipeline */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={14} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Active Pipeline</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PIPELINE_BADGES.map((b) => (
                <span key={b.label} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-semibold ${b.color}`}>
                  <span className="text-[9px] font-bold uppercase opacity-60">{b.label}:</span>
                  {b.value}
                </span>
              ))}
            </div>
          </div>

          {/* Live Transcription */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={14} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Live Transcription</span>
            </div>
            <div className="min-h-[52px] flex flex-col items-center justify-center rounded-lg bg-slate-50 border border-slate-100 p-3">
              {callState === 'active' ? (
                <>
                  <VoiceWaveform active={agentSpeaking} />
                  <p className="text-[11px] text-slate-400 mt-2">
                    {agentSpeaking ? 'Agent speaking…' : 'Listening…'}
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-400 text-center">
                  Sarvam streaming. Click mic to start.
                </p>
              )}
            </div>
          </div>

          {/* Voice Call */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <Volume2 size={14} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Voice Call</span>
            </div>

            {callError && (
              <div className="mb-3 flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span>{callError}</span>
              </div>
            )}

            <div className="flex flex-col items-center gap-3 py-2">
              {/* Big phone icon */}
              <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${callState === 'active' ? 'bg-green-100 border-2 border-green-300' : callState === 'connecting' ? 'bg-amber-100 border-2 border-amber-300 animate-pulse' : 'bg-slate-100 border-2 border-slate-200'}`}>
                {callState === 'active' ? (
                  <Phone size={28} className="text-green-600" />
                ) : callState === 'connecting' ? (
                  <Loader2 size={28} className="text-amber-600 animate-spin" />
                ) : callState === 'ended' ? (
                  <PhoneOff size={28} className="text-slate-400" />
                ) : (
                  <Phone size={28} className="text-slate-400" />
                )}
              </div>

              <div className="text-center">
                {callState === 'idle' && <p className="text-sm font-medium text-slate-700">Voice Call</p>}
                {callState === 'connecting' && <p className="text-sm font-medium text-amber-700">Connecting…</p>}
                {callState === 'active' && (
                  <p className="text-sm font-medium text-green-700">
                    <CallTimer startTime={callStart} />
                  </p>
                )}
                {callState === 'ended' && <p className="text-sm font-medium text-slate-500">Call ended</p>}
                <p className="text-xs text-slate-400 mt-0.5">Hands-free continuous conversation</p>
              </div>

              {/* Main call button */}
              {callState === 'idle' || callState === 'ended' ? (
                <button
                  onClick={() => void startVoiceCall()}
                  disabled={callState === 'ended'}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
                >
                  <Mic size={15} />
                  Start Voice Call
                </button>
              ) : callState === 'connecting' ? (
                <button disabled className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold opacity-80">
                  <Loader2 size={15} className="animate-spin" /> Connecting…
                </button>
              ) : (
                <div className="w-full flex gap-2">
                  <button
                    onClick={() => void toggleMute()}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition border ${muted ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}`}
                  >
                    {muted ? <MicOff size={14} /> : <Mic size={14} />}
                    {muted ? 'Unmute' : 'Mute'}
                  </button>
                  <button
                    onClick={() => void endVoiceCall()}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition"
                  >
                    <PhoneOff size={14} /> End
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Simulated Lead (for text chat) */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button
              onClick={() => setLeadOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              Simulated Lead (text chat)
              {leadOpen ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
            </button>
            {leadOpen && (
              <div className="p-4 space-y-3">
                {(['name', 'phone', 'city'] as const).map((field) => (
                  <div key={field}>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{field}</label>
                    <input
                      value={lead[field]}
                      onChange={(e) => setLead((l) => ({ ...l, [field]: e.target.value }))}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                    />
                  </div>
                ))}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Stage</label>
                  <select value={lead.stage} onChange={(e) => setLead((l) => ({ ...l, stage: e.target.value }))} className="mt-0.5 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40">
                    {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
