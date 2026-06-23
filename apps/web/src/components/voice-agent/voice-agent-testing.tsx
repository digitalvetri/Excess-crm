'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Phone, RefreshCw, Play, Eye, EyeOff, CheckCircle, XCircle,
  Clock, Loader2, AlertCircle, Activity, Zap, MessageSquare, ChevronDown, ChevronRight,
  Radio, Copy, Check,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

// Personas were consolidated into a single unified EXCESS_AGENT (the API's test
// endpoints only accept 'EXCESS_AGENT'). Old names are kept only as display labels
// for historical call records.
type Persona = 'EXCESS_AGENT';
type CallStatus = 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_ANSWER' | 'FAILED';

interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

interface QueueStats {
  voiceDial: QueueCounts;
  callWebhook: QueueCounts;
  humanHandoff: QueueCounts;
}

interface PayloadData {
  hasConfig: boolean;
  configId?: string;
  version?: number;
  activatedAt?: string | null;
  payload?: Record<string, unknown>;
}

interface RecentCall {
  id: string;
  vapiCallId: string | null;
  persona: string;
  status: CallStatus;
  durationSec: number | null;
  initiatedAt: string;
  connectedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  abVariant: string | null;
  lead: { name: string; phone: string; stage: string } | null;
  llmAnalysis: unknown;
}

interface TranscriptData {
  id: string;
  vapiCallId: string | null;
  persona: string;
  transcript: { text?: string } | null;
  llmAnalysis: {
    summary?: string;
    structuredData?: Record<string, unknown>;
    successEvaluation?: string;
  } | null;
}

interface LiveRoom {
  name: string;
  metadata: string | null;
  numParticipants: number;
  creationTime: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PERSONA_LABELS: Record<string, string> = {
  EXCESS_AGENT: 'Excess Agent',
  // Legacy labels — only for rendering historical call records.
  RESHMA_VERIFY: 'Reshma · Verify',
  KARTHIK_SALES: 'Karthik · Sales',
  RESHMA_FOLLOWUP: 'Reshma · Follow-up',
};

const STATUS_CONFIG: Record<CallStatus, { label: string; color: string; icon: React.ElementType }> = {
  QUEUED:      { label: 'Queued',      color: 'text-slate-500 bg-slate-100',    icon: Clock },
  IN_PROGRESS: { label: 'Live',        color: 'text-blue-700 bg-blue-100',      icon: Activity },
  COMPLETED:   { label: 'Completed',   color: 'text-emerald-700 bg-emerald-100', icon: CheckCircle },
  NO_ANSWER:   { label: 'No Answer',   color: 'text-amber-700 bg-amber-100',    icon: AlertCircle },
  FAILED:      { label: 'Failed',      color: 'text-rose-700 bg-rose-100',      icon: XCircle },
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useQueueStats() {
  return useQuery<QueueStats>({
    queryKey: ['voice-queue-stats'],
    queryFn: () => api.get<{ data: QueueStats }>('/voice-agent/queue-stats').then((r) => r.data.data),
    refetchInterval: 5000,
  });
}

function useTestPayload(personaId: Persona) {
  return useQuery<PayloadData>({
    queryKey: ['voice-test-payload', personaId],
    queryFn: () =>
      api.get<{ data: PayloadData }>(`/voice-agent/test-payload/${personaId}`).then((r) => r.data.data),
  });
}

function useRecentCalls() {
  return useQuery<RecentCall[]>({
    queryKey: ['voice-recent-calls'],
    queryFn: () =>
      api.get<{ data: RecentCall[] }>('/voice-agent/recent-calls').then((r) => r.data.data),
    refetchInterval: 8000,
  });
}

function useTranscript(callId: string | null) {
  return useQuery<TranscriptData>({
    queryKey: ['call-transcript', callId],
    queryFn: () =>
      api.get<{ data: TranscriptData }>(`/voice-agent/recent-calls/${callId}/transcript`).then((r) => r.data.data),
    enabled: !!callId,
  });
}

function useTestDial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { phone: string; name: string; personaId: Persona }) =>
      api.post<{ data: { queued: boolean; leadId: string; jobId: string } }>('/voice-agent/test-dial', body).then((r) => r.data.data),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ['voice-recent-calls'] }), 2000);
    },
  });
}

function useLiveRooms() {
  return useQuery<LiveRoom[]>({
    queryKey: ['livekit-rooms'],
    queryFn: () =>
      api.get<{ data: LiveRoom[] }>('/voice-agent/rooms').then((r) => r.data.data),
    refetchInterval: 5000,
  });
}

// ─── Live Rooms Panel ─────────────────────────────────────────────────────────

function LiveRoomsPanel() {
  const { data: rooms, isFetching, dataUpdatedAt } = useLiveRooms();
  const qc = useQueryClient();
  const [copiedName, setCopiedName] = useState<string | null>(null);

  function copyRoomName(name: string) {
    void navigator.clipboard.writeText(name);
    setCopiedName(name);
    setTimeout(() => setCopiedName(null), 2000);
  }

  const activeRooms = rooms ?? [];

  return (
    <div className="bg-white rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-800">Live Rooms</h3>
            {activeRooms.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-medium animate-pulse">
                <Activity size={10} /> {activeRooms.length} active
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            LiveKit rooms · auto-refreshes every 5s
            {dataUpdatedAt > 0 && ` · ${format(dataUpdatedAt, 'HH:mm:ss')}`}
          </p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['livekit-rooms'] })}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {!rooms ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : activeRooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Radio size={24} className="text-slate-200 mb-2" />
          <p className="text-sm text-slate-500">No active rooms</p>
          <p className="text-xs text-slate-400 mt-1">
            {rooms !== undefined ? 'LiveKit rooms will appear here when calls are in progress' : 'LiveKit not configured'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeRooms.map((room) => (
            <div key={room.name} className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono text-slate-700 truncate">{room.name}</p>
                {room.metadata && (
                  <p className="text-xs text-slate-400 truncate mt-0.5">{room.metadata}</p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="flex items-center gap-1 text-xs text-slate-600">
                  <Activity size={11} className="text-blue-500" />
                  {room.numParticipants} participant{room.numParticipants !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => copyRoomName(room.name)}
                  title="Copy room name"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {copiedName === room.name ? (
                    <Check size={13} className="text-emerald-500" />
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Queue Health Panel ───────────────────────────────────────────────────────

function QueueHealthPanel() {
  const { data, isFetching, dataUpdatedAt } = useQueueStats();
  const qc = useQueryClient();

  const queues = data
    ? [
        { key: 'voiceDial',    label: 'Voice Dial',    counts: data.voiceDial },
        { key: 'callWebhook',  label: 'Call Webhook',  counts: data.callWebhook },
        { key: 'humanHandoff', label: 'Human Handoff', counts: data.humanHandoff },
      ]
    : [];

  return (
    <div className="bg-white rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Queue Health</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Auto-refreshes every 5s
            {dataUpdatedAt > 0 && ` · Last: ${format(dataUpdatedAt, 'HH:mm:ss')}`}
          </p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['voice-queue-stats'] })}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {!data ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {queues.map(({ key, label, counts }) => (
            <div key={key} className="rounded-lg border border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                {counts.active > 0 && (
                  <span className="flex items-center gap-1 text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-medium animate-pulse">
                    <Activity size={10} /> {counts.active} live
                  </span>
                )}
                {counts.failed > 0 && (
                  <span className="flex items-center gap-1 text-xs text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full font-medium">
                    <XCircle size={10} /> {counts.failed} failed
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Waiting',   value: counts.waiting,   color: 'text-slate-600' },
                  { label: 'Active',    value: counts.active,    color: 'text-blue-600' },
                  { label: 'Completed', value: counts.completed, color: 'text-emerald-600' },
                  { label: 'Failed',    value: counts.failed,    color: counts.failed > 0 ? 'text-rose-600' : 'text-slate-400' },
                ].map(({ label: l, value, color }) => (
                  <div key={l} className="text-center">
                    <p className={`text-base font-bold tabular-nums ${color}`}>{value}</p>
                    <p className="text-xs text-slate-400">{l}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Payload Preview Panel ────────────────────────────────────────────────────

function PayloadPreviewPanel() {
  const [selectedPersona, setSelectedPersona] = useState<Persona>('EXCESS_AGENT');
  const [showFull, setShowFull] = useState(false);
  const { data, isLoading, refetch } = useTestPayload(selectedPersona);

  return (
    <div className="bg-white rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Agent Config Preview</h3>
          <p className="text-xs text-slate-400 mt-0.5">Active persona config the worker uses — no call made</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedPersona}
            onChange={(e) => { setSelectedPersona(e.target.value as Persona); setShowFull(false); }}
            className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white"
          >
            <option value="EXCESS_AGENT">Excess Agent</option>
          </select>
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 bg-slate-100 rounded-lg animate-pulse" />
      ) : !data?.hasConfig ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <AlertCircle size={28} className="text-amber-400 mb-2" />
          <p className="text-sm font-medium text-slate-700">No active config</p>
          <p className="text-xs text-slate-400 mt-1">Click a persona card above and Save & Activate to see the payload</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-medium">
              <CheckCircle size={11} /> v{data.version} active
            </span>
            {data.activatedAt && (
              <span className="text-xs text-slate-400">
                activated {formatDistanceToNow(new Date(data.activatedAt), { addSuffix: true })}
              </span>
            )}
          </div>

          {/* Provider summary badges */}
          {data.payload && (
            <div className="flex flex-wrap gap-2 mb-3">
              {[
                { label: 'STT', value: 'Sarvam' },
                { label: 'LLM', value: 'Groq / Llama' },
                { label: 'TTS', value: 'ElevenLabs' },
              ].map(({ label, value }) => (
                <span key={label} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                  {label}: {value}
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <pre className={`text-xs bg-slate-950 text-emerald-400 rounded-lg p-4 overflow-x-auto font-mono leading-relaxed ${!showFull ? 'max-h-48 overflow-y-hidden' : ''}`}>
              {JSON.stringify(data.payload, null, 2)}
            </pre>
            {!showFull && (
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-950 to-transparent rounded-b-lg flex items-end justify-center pb-2">
                <button
                  onClick={() => setShowFull(true)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  <ChevronDown size={13} /> Show full payload
                </button>
              </div>
            )}
          </div>
          {showFull && (
            <button
              onClick={() => setShowFull(false)}
              className="mt-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Collapse
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Test Dial Panel ──────────────────────────────────────────────────────────

function TestDialPanel() {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('Test Lead');
  const [persona] = useState<Persona>('EXCESS_AGENT');
  const testDial = useTestDial();

  async function handleDial() {
    if (!phone.trim()) return;
    await testDial.mutateAsync({ phone: phone.trim(), name: name.trim() || 'Test Lead', personaId: persona });
  }

  return (
    <div className="bg-white rounded-xl border border-border p-6">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-slate-800">Test Dial</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Fire a real LiveKit call using the active config — creates a temporary test lead
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Phone number</label>
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Name</label>
            <input
              type="text"
              placeholder="Test Lead"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Persona</label>
          {/* Single unified agent — no persona to choose. */}
          <div className="px-3 py-2 rounded-lg border border-primary/50 bg-primary/5 text-primary text-xs font-medium w-fit">
            {PERSONA_LABELS[persona]}
          </div>
        </div>

        {testDial.isSuccess && testDial.data && (
          <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <CheckCircle size={14} className="text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-emerald-700">Call queued successfully</p>
              <p className="text-xs text-emerald-600 font-mono mt-0.5">
                Lead: {testDial.data.leadId.slice(0, 8)}… · Job: {testDial.data.jobId}
              </p>
            </div>
          </div>
        )}

        {testDial.isError && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg">
            <XCircle size={14} className="text-rose-600 flex-shrink-0" />
            <p className="text-xs text-rose-700">
              {(testDial.error as Error)?.message ?? 'Failed to queue call — check LIVEKIT_API_KEY and LIVEKIT_API_SECRET'}
            </p>
          </div>
        )}

        <button
          onClick={handleDial}
          disabled={!phone.trim() || testDial.isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {testDial.isPending ? (
            <><Loader2 size={14} className="animate-spin" /> Queuing…</>
          ) : (
            <><Play size={14} /> Fire Test Call</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Call Row (with expand for transcript) ────────────────────────────────────

function CallRow({ call }: { call: RecentCall }) {
  const [expanded, setExpanded] = useState(false);
  const { data: transcriptData, isLoading: loadingTx } = useTranscript(expanded ? call.id : null);

  const statusCfg = STATUS_CONFIG[call.status] ?? STATUS_CONFIG.FAILED;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}>
          <StatusIcon size={11} />
          {statusCfg.label}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 truncate">
            {call.lead?.name ?? 'Unknown'} · {call.lead?.phone ?? '–'}
          </p>
          <p className="text-xs text-slate-400">
            {PERSONA_LABELS[call.persona] ?? call.persona}
            {call.durationSec != null && ` · ${Math.floor(call.durationSec / 60)}m ${call.durationSec % 60}s`}
            {call.endReason && ` · ${call.endReason}`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {call.lead?.stage && (
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-mono">
              {call.lead.stage}
            </span>
          )}
          <span className="text-xs text-slate-400">
            {formatDistanceToNow(new Date(call.initiatedAt), { addSuffix: true })}
          </span>
          {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 bg-slate-50 space-y-3">
          {/* LiveKit room / call ID */}
          {call.vapiCallId && (
            <p className="text-xs font-mono text-slate-500">
              Room: <span className="text-slate-700">{call.vapiCallId}</span>
            </p>
          )}

          {loadingTx ? (
            <div className="h-20 bg-slate-200 rounded animate-pulse" />
          ) : transcriptData ? (
            <>
              {/* LLM Analysis */}
              {transcriptData.llmAnalysis && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">AI Analysis</p>
                  <div className="space-y-1.5 bg-white rounded-lg border border-slate-200 p-3">
                    {transcriptData.llmAnalysis.summary && (
                      <p className="text-xs text-slate-700"><span className="font-medium">Summary:</span> {transcriptData.llmAnalysis.summary}</p>
                    )}
                    {transcriptData.llmAnalysis.successEvaluation && (
                      <p className="text-xs text-slate-700"><span className="font-medium">Outcome:</span> {transcriptData.llmAnalysis.successEvaluation}</p>
                    )}
                    {transcriptData.llmAnalysis.structuredData && Object.keys(transcriptData.llmAnalysis.structuredData).length > 0 && (
                      <pre className="text-xs font-mono text-slate-600 bg-slate-50 rounded p-2 overflow-x-auto">
                        {JSON.stringify(transcriptData.llmAnalysis.structuredData, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )}

              {/* Transcript */}
              {transcriptData.transcript?.text ? (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Transcript</p>
                  <div className="bg-white rounded-lg border border-slate-200 p-3 max-h-48 overflow-y-auto">
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {transcriptData.transcript.text}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  {call.status === 'COMPLETED' ? 'No transcript yet — may still be processing' : 'No transcript available'}
                </p>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Recent Calls Panel ───────────────────────────────────────────────────────

function RecentCallsPanel() {
  const { data: calls, isFetching, dataUpdatedAt } = useRecentCalls();
  const qc = useQueryClient();

  return (
    <div className="bg-white rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Recent Calls</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Auto-refreshes every 8s · Click a row for transcript + AI analysis
            {dataUpdatedAt > 0 && ` · ${format(dataUpdatedAt, 'HH:mm:ss')}`}
          </p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['voice-recent-calls'] })}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {!calls ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : calls.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <MessageSquare size={28} className="text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">No calls yet</p>
          <p className="text-xs text-slate-400 mt-1">Use the Test Dial panel to fire your first call</p>
        </div>
      ) : (
        <div className="space-y-2">
          {calls.map((call) => <CallRow key={call.id} call={call} />)}
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function VoiceAgentTesting() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 bg-amber-100 rounded-lg">
            <Zap size={14} className="text-amber-600" />
          </div>
          <h2 className="text-base font-semibold text-slate-800">Test & Monitor</h2>
        </div>
        <p className="text-sm text-slate-500">
          Verify your agent configuration, fire test calls, and inspect live pipeline health.
        </p>
      </div>

      {/* Live Rooms */}
      <LiveRoomsPanel />

      {/* Top row: Queue health + Payload preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QueueHealthPanel />
        <PayloadPreviewPanel />
      </div>

      {/* Test dial */}
      <TestDialPanel />

      {/* Recent calls */}
      <RecentCallsPanel />
    </div>
  );
}
