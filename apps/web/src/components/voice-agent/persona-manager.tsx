'use client';

import { useState, useRef } from 'react';
import type React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle, Loader2, AlertCircle, Mic, Brain, Volume2, Zap,
  Settings2, ChevronDown, Check, Lock, Upload, Plus, RefreshCw, Clock,
  Play, Square,
} from 'lucide-react';
import { format } from 'date-fns';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoiceConfig {
  firstMessage?: string;
  language?: string;
  sttProvider?: string;
  llmProvider?: string;
  ttsProvider?: string;
  voiceId?: string;
  responseTiming?: 'low_latency' | 'balanced' | 'conservative';
  voiceSpeed?: number;
  allowInterruptions?: boolean;
  maxDurationSec?: number;
  idleTimeoutSec?: number;
  idleTurns?: number;
  callTransfer?: { enabled: boolean; number: string };
}

interface PersonaConfig {
  id: string;
  personaId: string;
  version: number;
  isActive: boolean;
  activatedAt: string | null;
  createdAt: string;
  systemPrompt: string;
  voiceConfig?: VoiceConfig | null;
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  preview_url: string | null;
  labels: Record<string, string>;
  description: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PERSONA_META: Record<string, {
  name: string; subtitle: string; role: string; trigger: string; defaultVoiceId: string;
}> = {
  EXCESS_AGENT: {
    name: 'Excess AI', subtitle: 'Agent',
    role: 'Verify · Convert · Follow-up', trigger: 'Every call', defaultVoiceId: 'EXAVITQu4vr4xnSDxMaL',
  },
};

const DEFAULT_PROMPTS: Record<string, string> = {
  EXCESS_AGENT: `You are an AI voice agent for Excess Renew Solar, a leading solar energy company in Tamil Nadu with 500+ successful installations since 2009.

LANGUAGE RULE: Speak in Tamil by default. Switch to English ONLY if the customer speaks English first. You may open with a short bilingual greeting.

OBJECTIVE: Handle all stages of the lead lifecycle — verify new enquiries, convert qualified leads, and re-engage follow-up leads.

LEAD STAGE HANDLING:

NEW LEADS — Verify & Qualify:
1. Greet the customer by name in Tamil:
   Tamil: "Vanakkam! [name] sir/madam pesugireergala? Naanu Excess Renew Solar-ilirundhu Reshma pesugiren."
   English fallback: "Hello! Am I speaking with [name]? This is Reshma from Excess Renew Solar."
2. Confirm interest: "Neengal solar panel pathi enquiry panni iruntheergal — ippo pesuvatharku neram sari-aa?"
3. Qualify with 2-3 questions:
   - Property type: residential / commercial / industrial?
   - Monthly electricity bill (approximate)?
   - Location/city?
4. Based on answers:
   - Interested and qualified → call updateLeadStage with stage "QUALIFIED"
   - Needs follow-up later → call scheduleFollowUp with the agreed time
   - Wrong number / not interested → call updateLeadStage with stage "WRONG_ENQUIRY"
   - Invalid contact → call updateLeadStage with stage "INVALID"

QUALIFIED LEADS — Sales Conversion:
1. Greet: "Vanakkam [name]! Solar enquiry pathi pesuvom — Excess Renew Solar-ilirundhu pesugiren."
2. Confirm property type, electricity bill, and location.
3. Present the solution:
   - Recommend system size based on bill (e.g. ₹3000/month → 3kW system)
   - Savings: payback period typically 3-4 years, 25-year panel warranty
   - Current government subsidy: PM-KUSUM or state solar scheme
   - Trust signals: 500+ installations, in-house installation team
4. Close:
   - Ready to proceed → schedule site survey: call scheduleAppointment
   - Needs time → set a callback: call scheduleFollowUp
   - Not interested → call updateLeadStage with stage "INVALID"

FOLLOW-UP LEADS — Re-engagement:
1. Greet: "Vanakkam [name]! Excess Renew Solar-ilirundhu pesugiren — scheduled call panninom, ippo pesuvatharku neram sari-aa?"
2. Reference the previous conversation briefly.
3. Check current interest:
   - Still interested → re-qualify and call updateLeadStage with stage "QUALIFIED"
   - Needs more time → reschedule: call rescheduleFollowUp
   - Not interested → call updateLeadStage with stage "INVALID"

TONE: Warm, helpful, never pushy. Keep calls focused and under 5 minutes.
IMPORTANT: Always use the lead's name. Never make up information — use the tools to get real data.`,
};

const PERSONAS = ['EXCESS_AGENT'] as const;
type PersonaId = (typeof PERSONAS)[number];

const DEFAULT_VOICE_CONFIG: Required<VoiceConfig> = {
  firstMessage: '',
  language: 'ta',
  sttProvider: 'sarvam',
  llmProvider: 'groq/llama-3.3-70b-versatile',
  ttsProvider: 'elevenlabs',
  voiceId: 'EXAVITQu4vr4xnSDxMaL',
  responseTiming: 'balanced',
  voiceSpeed: 1.0,
  allowInterruptions: true,
  maxDurationSec: 300,
  idleTimeoutSec: 15,
  idleTurns: 3,
  callTransfer: { enabled: false, number: '' },
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useVoiceAgentConfigs() {
  return useQuery({
    queryKey: ['voice-agent-configs'],
    queryFn: () => api.get<{ data: PersonaConfig[] }>('/voice-agent/configs').then((r) => r.data.data),
  });
}

function useCreateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { personaId: string; systemPrompt: string; voiceConfig: VoiceConfig }) =>
      api.post<{ data: PersonaConfig }>('/voice-agent/configs', body).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voice-agent-configs'] }),
  });
}

function useActivateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/voice-agent/configs/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voice-agent-configs'] }),
  });
}

function useReseedPrompts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ data: { totalUpdated: number } }>('/voice-agent/reseed-prompts').then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voice-agent-configs'] }),
  });
}

function useVoices() {
  return useQuery({
    queryKey: ['elevenlabs-voices'],
    queryFn: () => api.get<{ data: ElevenLabsVoice[] }>('/voice-agent/voices').then((r) => r.data.data),
    staleTime: 60_000,
  });
}

function useCreateVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) =>
      api.post<{ data: { voiceId: string } }>('/voice-agent/voices', form).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['elevenlabs-voices'] }),
  });
}

// ─── Utility components ────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: React.ElementType; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
    </label>
  );
}

function RangeSlider({ label, value, min, max, step = 1, unit = '', onChange, formatValue }: {
  label: string; value: number; min: number; max: number; step?: number;
  unit?: string; onChange: (v: number) => void; formatValue?: (v: number) => string;
}) {
  const display = formatValue ? formatValue(value) : `${value}${unit}`;
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm text-slate-600">{label}</span>
        <span className="text-sm font-semibold text-slate-800 tabular-nums">{display}</span>
      </div>
      <div className="relative h-5 flex items-center">
        <div className="w-full h-1.5 bg-slate-200 rounded-full">
          <div className="h-1.5 bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-5"
        />
        <div
          className="absolute w-4 h-4 bg-white border-2 border-primary rounded-full shadow-sm pointer-events-none"
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-1">
        <span>{formatValue ? formatValue(min) : `${min}${unit}`}</span>
        <span>{formatValue ? formatValue(max) : `${max}${unit}`}</span>
      </div>
    </div>
  );
}

// ─── Voice Upload Form ─────────────────────────────────────────────────────────

const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/aac', 'audio/flac', 'audio/x-m4a'];

function VoiceUploadForm({ onSuccess }: { onSuccess: (voiceId: string) => void }) {
  const [name, setName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const createVoice = useCreateVoice();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    const invalid = selected.filter((f) => {
      const mime = f.type.toLowerCase();
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      const validExt = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext);
      const validMime = ALLOWED_AUDIO_TYPES.includes(mime) || mime.startsWith('audio/');
      return !validExt && !validMime;
    });
    if (invalid.length > 0) {
      setFileError(`"${invalid[0]!.name}" is not an audio file. Please upload mp3, wav, m4a, or ogg files — not video files.`);
      setFiles([]);
      e.target.value = '';
      return;
    }
    setFileError('');
    setFiles(selected);
  }

  async function handleUpload() {
    if (!name.trim() || files.length === 0) return;
    const form = new FormData();
    form.append('name', name.trim());
    form.append('description', `Cloned voice for ${name.trim()}`);
    files.forEach((f) => form.append('files', f));
    const result = await createVoice.mutateAsync(form);
    onSuccess(result.voiceId);
  }

  return (
    <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
      <p className="text-xs font-semibold text-slate-600">Clone a New Voice</p>
      <div>
        <label className="text-xs text-slate-500 mb-1 block">Voice Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Reshma, Selvi, Murugan…"
          className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
        />
      </div>
      <div>
        <label className="text-xs text-slate-500 mb-1 block">
          Audio Samples — mp3, wav, m4a, ogg only (min 1 min of clear speech)
        </label>
        <input
          type="file"
          multiple
          accept=".mp3,.wav,.ogg,.m4a,.aac,.flac,audio/*"
          onChange={handleFileChange}
          className="w-full text-xs text-slate-600 file:mr-3 file:px-3 file:py-1.5 file:text-xs file:border file:border-slate-200 file:rounded-lg file:text-primary file:bg-white hover:file:bg-primary/5 file:cursor-pointer"
        />
        {files.length > 0 && (
          <p className="text-xs text-green-600 mt-1">✓ {files.length} audio file{files.length > 1 ? 's' : ''} selected</p>
        )}
        {fileError && (
          <p className="text-xs text-rose-600 mt-1 flex items-start gap-1">
            <AlertCircle size={12} className="shrink-0 mt-0.5" /> {fileError}
          </p>
        )}
        <p className="text-[10px] text-slate-400 mt-1.5">
          Tip: Send a WhatsApp voice note to yourself → download the .ogg file → upload here
        </p>
      </div>
      {createVoice.isError && (
        <p className="text-xs text-rose-600 flex items-start gap-1">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          {(createVoice.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
            ?? (createVoice.error as Error)?.message
            ?? 'Upload failed'}
        </p>
      )}
      <button
        onClick={() => void handleUpload()}
        disabled={!name.trim() || files.length === 0 || createVoice.isPending || !!fileError}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
      >
        {createVoice.isPending
          ? <><Loader2 size={13} className="animate-spin" /> Cloning…</>
          : <><Upload size={13} /> Clone Voice</>}
      </button>
    </div>
  );
}

// ─── Dynamic Voice Picker ─────────────────────────────────────────────────────

function DynamicVoicePicker({ voiceId, onChange }: {
  voiceId: string;
  onChange: (v: string) => void;
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { data: voices, isLoading, refetch } = useVoices();

  const cloned = voices?.filter((v) => v.category === 'cloned') ?? [];
  const premade = voices?.filter((v) => v.category !== 'cloned') ?? [];
  const all = [...cloned, ...premade];

  function handlePreview(e: React.MouseEvent, voice: ElevenLabsVoice) {
    e.stopPropagation();
    if (!voice.preview_url) return;

    if (playingId === voice.voice_id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }

    audioRef.current?.pause();
    const audio = new Audio(voice.preview_url);
    audioRef.current = audio;
    setPlayingId(voice.voice_id);
    audio.play().catch(() => setPlayingId(null));
    audio.onended = () => setPlayingId(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Voice</p>
          <p className="text-xs text-slate-400 mt-0.5">Cloned voices appear first · click ▶ to preview</p>
        </div>
        <button
          onClick={() => void refetch()}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          title="Refresh voices"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : all.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          No voices found — check your ElevenLabs API key or upload one below
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {all.map((voice) => {
            const selected = voiceId === voice.voice_id;
            const isPlaying = playingId === voice.voice_id;
            return (
              <div
                key={voice.voice_id}
                onClick={() => onChange(voice.voice_id)}
                className={`flex items-start justify-between px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  selected
                    ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700 truncate">{voice.name}</p>
                  <p className="text-xs text-slate-400 capitalize truncate">
                    {voice.labels?.['accent'] ?? voice.labels?.['language'] ?? voice.category}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2 mt-0.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    voice.category === 'cloned' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {voice.category === 'cloned' ? 'Cloned' : 'EL'}
                  </span>
                  {voice.preview_url && (
                    <button
                      onClick={(e) => handlePreview(e, voice)}
                      title={isPlaying ? 'Stop preview' : 'Play preview'}
                      className={`p-1 rounded-full transition-colors ${
                        isPlaying
                          ? 'bg-primary text-white'
                          : 'text-slate-400 hover:text-primary hover:bg-primary/10'
                      }`}
                    >
                      {isPlaying ? <Square size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
                    </button>
                  )}
                  {selected && <Check size={13} className="text-primary flex-shrink-0" />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setShowUpload((p) => !p)}
        className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
      >
        {showUpload ? (
          <span className="text-slate-500">✕ Cancel</span>
        ) : (
          <><Plus size={14} /> Upload new voice</>
        )}
      </button>

      {showUpload && (
        <VoiceUploadForm
          onSuccess={(newVoiceId) => {
            onChange(newVoiceId);
            setShowUpload(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({ systemPrompt, voiceConfig, onChange }: {
  systemPrompt: string;
  voiceConfig: VoiceConfig;
  onChange: (patch: { systemPrompt?: string; voiceConfig?: Partial<VoiceConfig> }) => void;
}) {
  return (
    <div className="space-y-6 p-6">
      <div>
        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Language</label>
        <div className="relative max-w-xs">
          <select
            value={voiceConfig.language ?? 'ta'}
            onChange={(e) => onChange({ voiceConfig: { language: e.target.value } })}
            className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
          >
            <option value="ta">Tamil (தமிழ்)</option>
            <option value="en">English</option>
            <option value="auto">Auto-detect</option>
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
          First Message
          <span className="ml-2 normal-case text-slate-400 font-normal">Agent speaks this when the call connects</span>
        </label>
        <textarea
          rows={3}
          placeholder={`e.g. "வணக்கம்! நான் Reshma, Excess Renew Solar-இலிருந்து பேசுகிறேன்…"`}
          value={voiceConfig.firstMessage ?? ''}
          onChange={(e) => onChange({ voiceConfig: { firstMessage: e.target.value } })}
          className="w-full text-sm bg-white border border-slate-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 text-slate-700"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
          Agent Instructions
          <span className="ml-2 normal-case text-slate-400 font-normal">{systemPrompt.length} chars</span>
        </label>
        <textarea
          rows={16}
          value={systemPrompt}
          onChange={(e) => onChange({ systemPrompt: e.target.value })}
          spellCheck={false}
          className="w-full text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg p-4 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 text-slate-700 leading-relaxed"
        />
      </div>
    </div>
  );
}

// ─── Tab: Voice & AI ──────────────────────────────────────────────────────────

function VoiceAITab({ voiceConfig, personaId, onChange }: {
  voiceConfig: VoiceConfig;
  personaId: PersonaId;
  onChange: (patch: Partial<VoiceConfig>) => void;
}) {
  return (
    <div className="space-y-8 p-6">
      {/* Provider Stack — LOCKED */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <Lock size={11} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Provider Stack · Locked</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-violet-50 rounded-xl p-4 border border-violet-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-violet-100 rounded-lg"><Mic size={12} className="text-violet-600" /></div>
              <span className="text-xs font-bold text-violet-700 uppercase tracking-wide">STT</span>
            </div>
            <p className="text-sm font-semibold text-slate-800">Sarvam</p>
            <p className="text-xs text-slate-500 mt-0.5">Batch · Tamil-first</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-emerald-100 rounded-lg"><Brain size={12} className="text-emerald-600" /></div>
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">LLM</span>
            </div>
            <p className="text-sm font-semibold text-slate-800">Groq</p>
            <p className="text-xs text-slate-500 mt-0.5">llama-3.3-70b · Fast</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-amber-100 rounded-lg"><Volume2 size={12} className="text-amber-600" /></div>
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">TTS</span>
            </div>
            <p className="text-sm font-semibold text-slate-800">ElevenLabs</p>
            <p className="text-xs text-slate-500 mt-0.5">Cloned voice · HD</p>
          </div>
        </div>
      </div>

      {/* Voice picker */}
      <DynamicVoicePicker
        voiceId={voiceConfig.voiceId ?? PERSONA_META[personaId]?.defaultVoiceId ?? 'mk-tamil-v1'}
        onChange={(v) => onChange({ voiceId: v })}
      />

      {/* Response Timing */}
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Response Timing</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'low_latency',   label: 'Low Latency',   desc: 'Fastest, may cut off' },
            { value: 'balanced',      label: 'Balanced',      desc: 'Recommended' },
            { value: 'conservative',  label: 'Conservative',  desc: 'Thoughtful pauses' },
          ] as const).map((opt) => {
            const selected = (voiceConfig.responseTiming ?? 'balanced') === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onChange({ responseTiming: opt.value })}
                className={`px-3 py-3 rounded-lg border text-left transition-all ${
                  selected
                    ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                  {selected && <Check size={12} className="text-primary" />}
                </div>
                <p className="text-xs text-slate-400">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Voice Speed */}
      <RangeSlider
        label="Voice Speed"
        value={voiceConfig.voiceSpeed ?? 1.0}
        min={0.5} max={2.0} step={0.1}
        onChange={(v) => onChange({ voiceSpeed: v })}
        formatValue={(v) => `${v.toFixed(1)}×`}
      />

      {/* Interruptions */}
      <div className="flex items-center justify-between py-3 border-t border-slate-100">
        <div>
          <p className="text-sm font-medium text-slate-700">Allow Interruptions</p>
          <p className="text-xs text-slate-400 mt-0.5">Callers can interrupt the agent mid-speech</p>
        </div>
        <Toggle
          checked={voiceConfig.allowInterruptions ?? true}
          onChange={(v) => onChange({ allowInterruptions: v })}
        />
      </div>
    </div>
  );
}

// ─── Tab: Behavior ────────────────────────────────────────────────────────────

function BehaviorTab({ voiceConfig, onChange }: {
  voiceConfig: VoiceConfig;
  onChange: (patch: Partial<VoiceConfig>) => void;
}) {
  const transfer = voiceConfig.callTransfer ?? { enabled: false, number: '' };

  return (
    <div className="space-y-8 p-6">
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Outcome Definitions</p>
        <div className="space-y-2">
          {[
            { label: 'Qualified',     key: 'QUALIFIED',     cls: 'bg-emerald-100 text-emerald-700', desc: 'Lead confirmed interest' },
            { label: 'Follow-up',     key: 'FOLLOW_UP',     cls: 'bg-blue-100 text-blue-700',       desc: 'Requested callback later' },
            { label: 'Not Answered',  key: 'NOT_ANSWERED',  cls: 'bg-amber-100 text-amber-700',     desc: 'No answer / busy / voicemail' },
            { label: 'Invalid',       key: 'INVALID',       cls: 'bg-rose-100 text-rose-700',       desc: 'Not a valid contact' },
            { label: 'Wrong Enquiry', key: 'WRONG_ENQUIRY', cls: 'bg-slate-100 text-slate-700',     desc: 'Not interested in solar' },
            { label: 'Converted',     key: 'CONVERTED',     cls: 'bg-violet-100 text-violet-700',   desc: 'Ready to proceed' },
          ].map((o) => (
            <div key={o.key} className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <span className="text-sm font-medium text-slate-700">{o.label}</span>
                <p className="text-xs text-slate-400 mt-0.5">{o.desc}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${o.cls}`}>{o.key}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-5">Call Behaviour</p>
        <div className="space-y-6">
          <RangeSlider
            label="Max Duration"
            value={voiceConfig.maxDurationSec ?? 300}
            min={30} max={1800} step={30}
            onChange={(v) => onChange({ maxDurationSec: v })}
            formatValue={(v) => {
              const m = Math.floor(v / 60);
              const s = v % 60;
              return s === 0 ? `${m}m` : `${m}m ${s}s`;
            }}
          />
          <RangeSlider
            label="Inactivity Timeout"
            value={voiceConfig.idleTimeoutSec ?? 15}
            min={5} max={120} step={5} unit="s"
            onChange={(v) => onChange({ idleTimeoutSec: v })}
          />
          <RangeSlider
            label="Idle Turns"
            value={voiceConfig.idleTurns ?? 3}
            min={1} max={20} step={1} unit=" turns"
            onChange={(v) => onChange({ idleTurns: v })}
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Call Transfer</p>
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Enable Call Transfer</p>
              <p className="text-xs text-slate-400 mt-0.5">Transfer to a human agent when needed</p>
            </div>
            <Toggle
              checked={transfer.enabled}
              onChange={(v) => onChange({ callTransfer: { ...transfer, enabled: v } })}
            />
          </div>
          {transfer.enabled && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Transfer to number</label>
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={transfer.number}
                onChange={(e) => onChange({ callTransfer: { ...transfer, number: e.target.value } })}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Version History ──────────────────────────────────────────────────────────

function VersionHistory({ configs, personaId, onLoad, activateConfig }: {
  configs: PersonaConfig[];
  personaId: PersonaId;
  onLoad: (c: PersonaConfig) => void;
  activateConfig: ReturnType<typeof useActivateConfig>;
}) {
  const list = configs.filter((c) => c.personaId === personaId).sort((a, b) => b.version - a.version);
  if (list.length === 0) return null;

  return (
    <div className="px-6 pb-6 pt-4">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Version History</p>
      <div className="space-y-2">
        {list.map((cfg) => (
          <div
            key={cfg.id}
            className={`rounded-lg border px-4 py-3 ${cfg.isActive ? 'border-primary/30 bg-primary/5' : 'border-slate-200 bg-white'}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">v{cfg.version}</span>
                {cfg.isActive && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <CheckCircle size={11} /> Active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock size={11} />
                  {format(new Date(cfg.createdAt), 'dd MMM, HH:mm')}
                </span>
                {!cfg.isActive && (
                  <button
                    onClick={() => activateConfig.mutate(cfg.id)}
                    disabled={activateConfig.isPending}
                    className="text-xs text-primary font-medium hover:underline disabled:opacity-50"
                  >
                    Activate
                  </button>
                )}
                <button
                  onClick={() => onLoad(cfg)}
                  className="text-xs text-slate-500 hover:text-slate-700 font-medium hover:underline"
                >
                  Load
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Persona Editor ───────────────────────────────────────────────────────────

function PersonaEditor({ personaId, configs }: {
  personaId: PersonaId;
  configs: PersonaConfig[];
}) {
  const meta = PERSONA_META[personaId]!;
  const activeConfig = configs.find((c) => c.personaId === personaId && c.isActive);

  const [tab, setTab] = useState<'overview' | 'voice' | 'behavior'>('overview');
  const [systemPrompt, setSystemPrompt] = useState(
    activeConfig?.systemPrompt ?? DEFAULT_PROMPTS[personaId] ?? '',
  );
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({
    ...DEFAULT_VOICE_CONFIG,
    voiceId: meta.defaultVoiceId,
    ...(activeConfig?.voiceConfig ?? {}),
  });
  const [saved, setSaved] = useState(false);

  const createConfig = useCreateConfig();
  const activateConfig = useActivateConfig();

  function patchVoice(patch: Partial<VoiceConfig>) {
    setVoiceConfig((prev) => ({ ...prev, ...patch }));
  }

  function handleChange(patch: { systemPrompt?: string; voiceConfig?: Partial<VoiceConfig> }) {
    if (patch.systemPrompt !== undefined) setSystemPrompt(patch.systemPrompt);
    if (patch.voiceConfig) patchVoice(patch.voiceConfig);
  }

  async function handleSave() {
    const lockedConfig: VoiceConfig = {
      ...voiceConfig,
      sttProvider: 'sarvam',
      llmProvider: 'groq/llama-3.3-70b-versatile',
      ttsProvider: 'elevenlabs',
    };
    const result = await createConfig.mutateAsync({ personaId, systemPrompt, voiceConfig: lockedConfig });
    await activateConfig.mutateAsync(result.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
        <div>
          <h2 className="text-base font-semibold text-slate-800">
            {meta.name}{' '}
            <span className="text-slate-400 font-normal">·</span>{' '}
            {meta.subtitle}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {meta.role} · Trigger: {meta.trigger}
            {activeConfig && (
              <span className="ml-2 text-emerald-600 font-medium">v{activeConfig.version} active</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <CheckCircle size={12} /> Saved &amp; active
            </span>
          )}
          {(createConfig.isError || activateConfig.isError) && (
            <span className="flex items-center gap-1 text-xs text-rose-600">
              <AlertCircle size={12} /> Save failed
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={createConfig.isPending || activateConfig.isPending}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {(createConfig.isPending || activateConfig.isPending) && (
              <Loader2 size={13} className="animate-spin" />
            )}
            Save &amp; Activate
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 px-6 flex-shrink-0">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={Settings2} label="Overview" />
        <TabButton active={tab === 'voice'}    onClick={() => setTab('voice')}    icon={Volume2}   label="Voice & AI" />
        <TabButton active={tab === 'behavior'} onClick={() => setTab('behavior')} icon={Zap}       label="Behavior" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && (
          <OverviewTab systemPrompt={systemPrompt} voiceConfig={voiceConfig} onChange={handleChange} />
        )}
        {tab === 'voice' && (
          <VoiceAITab voiceConfig={voiceConfig} personaId={personaId} onChange={patchVoice} />
        )}
        {tab === 'behavior' && (
          <BehaviorTab voiceConfig={voiceConfig} onChange={patchVoice} />
        )}
        <div className="border-t border-slate-100 mt-2">
          <VersionHistory
            configs={configs}
            personaId={personaId}
            onLoad={(cfg) => {
              setSystemPrompt(cfg.systemPrompt);
              setVoiceConfig({ ...DEFAULT_VOICE_CONFIG, voiceId: meta.defaultVoiceId, ...(cfg.voiceConfig ?? {}) });
            }}
            activateConfig={activateConfig}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function PersonaManager() {
  const { data, isLoading } = useVoiceAgentConfigs();
  const reseed = useReseedPrompts();
  const configs = data ?? [];

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-border overflow-hidden animate-pulse" style={{ minHeight: '600px' }} />
    );
  }

  const activeConfig = configs.find((c) => c.personaId === 'EXCESS_AGENT' && c.isActive);
  const editorKey = `EXCESS_AGENT-${activeConfig?.id ?? 'none'}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-slate-500">
          Pushes the latest prompts shipped in code into the database for every tenant. Idempotent — unchanged prompts are skipped.
        </div>
        <div className="flex items-center gap-2">
          {reseed.isSuccess && (
            <span className="text-xs text-success">Synced — {reseed.data.totalUpdated} prompt(s) updated.</span>
          )}
          {reseed.isError && <span className="text-xs text-danger">Failed — try again.</span>}
          <button
            onClick={() => reseed.mutate()}
            disabled={reseed.isPending}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-white hover:opacity-90 disabled:opacity-50"
          >
            {reseed.isPending ? 'Syncing…' : 'Sync prompts from code'}
          </button>
        </div>
      </div>
      <div className="flex bg-white rounded-xl border border-border overflow-hidden" style={{ minHeight: '640px' }}>
        <PersonaEditor key={editorKey} personaId="EXCESS_AGENT" configs={configs} />
      </div>
    </div>
  );
}
