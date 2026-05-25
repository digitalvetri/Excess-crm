'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Phone, CheckCircle, X, ChevronRight, Clock, Loader2, AlertCircle,
  Mic, Brain, Volume2, Zap, Settings2, ChevronDown, Check,
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

// ─── Constants ────────────────────────────────────────────────────────────────

const PERSONA_META: Record<string, { name: string; role: string; trigger: string; defaultVoiceId: string }> = {
  RESHMA_VERIFY: {
    name: 'Reshma · Verify',
    role: 'Lead Verification',
    trigger: 'New lead arrives',
    defaultVoiceId: 'mk-tamil-v1',
  },
  KARTHIK_SALES: {
    name: 'Karthik · Sales',
    role: 'Sales Conversion',
    trigger: 'Lead qualified → +30 min',
    defaultVoiceId: 'edapadi',
  },
  RESHMA_FOLLOWUP: {
    name: 'Reshma · Follow-up',
    role: 'Re-engagement',
    trigger: 'Scheduled follow-up time',
    defaultVoiceId: 'mk-tamil-v1',
  },
};

const DEFAULT_PROMPTS: Record<string, string> = {
  RESHMA_VERIFY: `You are Reshma, a friendly and professional customer relations executive at Excess Renew, a leading solar energy company in Tamil Nadu with 500+ successful installations since 2009.

OBJECTIVE: Verify new enquiries and qualify leads for solar installations.

LANGUAGE: Match the customer's language (Tamil or English). Greet in both.

SCRIPT:
1. Greet: "Hello, namaskar! Am I speaking with [name]? This is Reshma calling from Excess Renew Solar."
2. Confirm interest: "We received your enquiry about solar installation. Is this a good time to talk?"
3. Qualify (ask 2-3 questions max):
   - Property type: residential / commercial / industrial?
   - Monthly electricity bill (approximate)?
   - Location/city?
4. Based on answers:
   - If interested and qualified → call updateLeadStage("QUALIFIED")
   - If interested but needs follow-up later → call scheduleFollowUp with a time they mention
   - If wrong number / not interested → call updateLeadStage("WRONG_ENQUIRY")
   - If invalid contact → call updateLeadStage("INVALID")

TONE: Warm, helpful, not pushy. Keep calls under 3 minutes.`,

  KARTHIK_SALES: `You are Karthik, a confident and knowledgeable solar sales consultant at Excess Renew.

OBJECTIVE: Convert qualified leads into committed customers by presenting tailored solar proposals.

LANGUAGE: Match the customer's language (Tamil or English).

SCRIPT:
1. Greet: "Hello [name], this is Karthik from Excess Renew Solar. Reshma from our team mentioned you're interested in a solar installation — congratulations on taking this step!"
2. Confirm details from verification call (property type, electricity bill, location).
3. Present solution:
   - System size recommendation based on bill
   - Savings estimate (payback period: typically 3-4 years)
   - Current government subsidy (PM-KUSUM or state scheme)
   - Highlight: 500+ installations, 25-year panel warranty, in-house installation team
4. Close:
   - If ready → schedule site survey: call scheduleFollowUp
   - If needs time → set a callback: call scheduleFollowUp
   - If not interested → call updateLeadStage("INVALID")

TONE: Consultative, confident. Never pushy. Keep under 5 minutes.`,

  RESHMA_FOLLOWUP: `You are Reshma, a friendly follow-up executive at Excess Renew Solar.

OBJECTIVE: Re-engage leads who requested a follow-up or went cold after initial contact.

LANGUAGE: Match the customer's language (Tamil or English).

SCRIPT:
1. Greet: "Hello [name], this is Reshma from Excess Renew Solar. I'm calling as we had scheduled — hope this is a good time?"
2. Reference the previous conversation.
3. Check current interest:
   - Still interested → re-qualify and connect with Karthik → call updateLeadStage("QUALIFIED")
   - Needs more time → reschedule: call scheduleFollowUp
   - Not interested → call updateLeadStage("INVALID")

TONE: Warm, patient. Keep it conversational.`,
};

const PERSONAS = ['RESHMA_VERIFY', 'KARTHIK_SALES', 'RESHMA_FOLLOWUP'] as const;
type PersonaId = (typeof PERSONAS)[number];

const ELEVENLABS_VOICES = [
  { id: 'mk-tamil-v1',   label: 'MK Tamil v1',       badge: 'Cloned',    lang: 'Tamil' },
  { id: 'edapadi',       label: 'Edapadi',            badge: 'Cloned',    lang: 'Tamil' },
  { id: 'mk',            label: 'MK',                 badge: 'ElevenLabs', lang: 'Tamil' },
  { id: 'mk-voice',      label: 'MK Voice',           badge: 'ElevenLabs', lang: 'Tamil' },
  { id: 'adam',          label: 'Adam – Dominant',    badge: 'ElevenLabs', lang: 'English' },
  { id: 'alice',         label: 'Alice – Engaging',   badge: 'ElevenLabs', lang: 'English' },
  { id: 'bella',         label: 'Bella – Bright',     badge: 'ElevenLabs', lang: 'English' },
  { id: 'callum',        label: 'Callum – Husky',     badge: 'ElevenLabs', lang: 'English' },
  { id: 'charlie',       label: 'Charlie – Confident',badge: 'ElevenLabs', lang: 'English' },
  { id: 'custom',        label: 'Custom Voice ID…',   badge: 'Custom',    lang: '' },
];

const DEFAULT_VOICE_CONFIG: Required<VoiceConfig> = {
  firstMessage: '',
  language: 'ta',
  sttProvider: 'sarvam',
  llmProvider: 'google/gemini-2.5-flash',
  ttsProvider: 'elevenlabs',
  voiceId: 'mk-tamil-v1',
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
    queryFn: () =>
      api.get<{ data: PersonaConfig[] }>('/voice-agent/configs').then((r) => r.data.data),
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function TabButton({
  active, onClick, icon: Icon, label,
}: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
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

function RangeSlider({
  label, value, min, max, step = 1, unit = '', onChange, formatValue,
}: {
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

function SelectField({
  label, value, options, onChange, icon: Icon,
}: {
  label: string; value: string; icon?: React.ElementType | null;
  options: { value: string; label: string; badge?: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
      <div className="relative">
        {Icon && <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full ${Icon ? 'pl-8' : 'pl-3'} pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 appearance-none`}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({
  systemPrompt, voiceConfig, onChange,
}: {
  systemPrompt: string;
  voiceConfig: VoiceConfig;
  onChange: (patch: { systemPrompt?: string; voiceConfig?: Partial<VoiceConfig> }) => void;
}) {
  return (
    <div className="space-y-6 p-6">
      {/* Language */}
      <SelectField
        label="Language"
        value={voiceConfig.language ?? 'ta'}
        options={[
          { value: 'ta', label: 'Tamil (தமிழ்)' },
          { value: 'en', label: 'English' },
          { value: 'auto', label: 'Auto-detect' },
        ]}
        onChange={(v) => onChange({ voiceConfig: { language: v } })}
      />

      {/* First Message */}
      <div>
        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
          First Message
          <span className="ml-2 normal-case text-slate-400 font-normal">Agent speaks first when call connects</span>
        </label>
        <textarea
          rows={3}
          placeholder={`e.g. "வணக்கம்! நான் Reshma, Excess Renew Solar-இலிருந்து பேசுகிறேன். நீங்கள் [name]-தானே?"`}
          value={voiceConfig.firstMessage ?? ''}
          onChange={(e) => onChange({ voiceConfig: { firstMessage: e.target.value } })}
          className="w-full text-sm bg-white border border-slate-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 text-slate-700"
        />
      </div>

      {/* System Prompt */}
      <div>
        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
          Agent Instructions
          <span className="ml-2 normal-case text-slate-400 font-normal">{systemPrompt.length} chars</span>
        </label>
        <textarea
          rows={14}
          value={systemPrompt}
          onChange={(e) => onChange({ systemPrompt: e.target.value })}
          spellCheck={false}
          className="w-full text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg p-4 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 text-slate-700 leading-relaxed"
        />
      </div>
    </div>
  );
}

// ─── Tab: Voice & AI ──────────────────────────────────────────────────────────

function VoiceAITab({
  voiceConfig, personaId, onChange,
}: {
  voiceConfig: VoiceConfig;
  personaId: PersonaId;
  onChange: (patch: Partial<VoiceConfig>) => void;
}) {
  const [customVoiceId, setCustomVoiceId] = useState('');
  const isCustom = voiceConfig.voiceId === 'custom' ||
    (!ELEVENLABS_VOICES.find((v) => v.id === voiceConfig.voiceId) && !!voiceConfig.voiceId);

  return (
    <div className="space-y-8 p-6">
      {/* Provider row */}
      <div className="grid grid-cols-3 gap-4">
        {/* STT */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-violet-100 rounded-lg">
              <Mic size={13} className="text-violet-600" />
            </div>
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">STT</span>
          </div>
          <SelectField
            label=""
            value={voiceConfig.sttProvider ?? 'sarvam'}
            options={[
              { value: 'sarvam', label: 'Sarvam Batch' },
              { value: 'deepgram', label: 'Deepgram Nova' },
              { value: 'google', label: 'Google STT' },
            ]}
            onChange={(v) => onChange({ sttProvider: v })}
          />
        </div>

        {/* LLM */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-emerald-100 rounded-lg">
              <Brain size={13} className="text-emerald-600" />
            </div>
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">LLM</span>
          </div>
          <SelectField
            label=""
            value={voiceConfig.llmProvider ?? 'google/gemini-2.5-flash'}
            options={[
              { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
              { value: 'google/gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
              { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
              { value: 'anthropic/claude-haiku', label: 'Claude Haiku' },
            ]}
            onChange={(v) => onChange({ llmProvider: v })}
          />
        </div>

        {/* TTS */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-amber-100 rounded-lg">
              <Volume2 size={13} className="text-amber-600" />
            </div>
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">TTS</span>
          </div>
          <SelectField
            label=""
            value={voiceConfig.ttsProvider ?? 'elevenlabs'}
            options={[
              { value: 'elevenlabs', label: 'ElevenLabs' },
              { value: 'google', label: 'Google TTS' },
              { value: 'azure', label: 'Azure Neural' },
            ]}
            onChange={(v) => onChange({ ttsProvider: v })}
          />
        </div>
      </div>

      {/* Voice picker */}
      <div>
        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
          Voice
          <span className="ml-2 normal-case font-normal text-slate-400">ElevenLabs · Cloned voices appear first</span>
        </label>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {ELEVENLABS_VOICES.filter((v) => v.id !== 'custom').map((voice) => {
            const selected = voiceConfig.voiceId === voice.id ||
              (voice.id === PERSONA_META[personaId]?.defaultVoiceId && !voiceConfig.voiceId);
            return (
              <button
                key={voice.id}
                onClick={() => onChange({ voiceId: voice.id })}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-all ${
                  selected
                    ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-slate-700">{voice.label}</p>
                  <p className="text-xs text-slate-400">{voice.lang}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    voice.badge === 'Cloned'
                      ? 'bg-violet-100 text-violet-700'
                      : voice.badge === 'Custom'
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {voice.badge}
                  </span>
                  {selected && <Check size={13} className="text-primary flex-shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
        {/* Custom voice ID */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Enter custom ElevenLabs voice ID…"
            value={isCustom ? (voiceConfig.voiceId ?? '') : customVoiceId}
            onChange={(e) => {
              setCustomVoiceId(e.target.value);
              if (e.target.value) onChange({ voiceId: e.target.value });
            }}
            className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
          />
        </div>
      </div>

      {/* Response Timing */}
      <div>
        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
          Response Timing
        </label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'low_latency', label: 'Low Latency', desc: 'Fastest, may cut off' },
            { value: 'balanced',    label: 'Balanced',    desc: 'Recommended' },
            { value: 'conservative', label: 'Conservative', desc: 'Thoughtful pauses' },
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
        min={0.5}
        max={2.0}
        step={0.1}
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

function BehaviorTab({
  voiceConfig, onChange,
}: {
  voiceConfig: VoiceConfig;
  onChange: (patch: Partial<VoiceConfig>) => void;
}) {
  const transfer = voiceConfig.callTransfer ?? { enabled: false, number: '' };

  return (
    <div className="space-y-8 p-6">
      {/* Outcome Definitions */}
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Outcome Definitions</p>
        <div className="space-y-2">
          {[
            { label: 'Qualified',        key: 'QUALIFIED',      color: 'emerald', desc: 'Lead confirmed interest' },
            { label: 'Follow-up',        key: 'FOLLOW_UP',      color: 'blue',    desc: 'Requested callback later' },
            { label: 'Not Answered',     key: 'NOT_ANSWERED',   color: 'amber',   desc: 'No answer / busy / voicemail' },
            { label: 'Invalid',          key: 'INVALID',        color: 'rose',    desc: 'Not a valid contact' },
            { label: 'Wrong Enquiry',    key: 'WRONG_ENQUIRY',  color: 'slate',   desc: 'Not interested in solar' },
            { label: 'Converted',        key: 'CONVERTED',      color: 'violet',  desc: 'Ready to proceed' },
          ].map((o) => (
            <div key={o.key} className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <span className="text-sm font-medium text-slate-700">{o.label}</span>
                <p className="text-xs text-slate-400 mt-0.5">{o.desc}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded font-mono font-medium bg-${o.color}-100 text-${o.color}-700`}>
                {o.key}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Call Behavior */}
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-5">Call Behaviour</p>
        <div className="space-y-6">
          <RangeSlider
            label="Max Duration"
            value={voiceConfig.maxDurationSec ?? 300}
            min={30}
            max={1800}
            step={30}
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
            min={5}
            max={120}
            step={5}
            unit="s"
            onChange={(v) => onChange({ idleTimeoutSec: v })}
          />
          <RangeSlider
            label="Idle Turns"
            value={voiceConfig.idleTurns ?? 3}
            min={1}
            max={20}
            step={1}
            unit=" turns"
            onChange={(v) => onChange({ idleTurns: v })}
          />
        </div>
      </div>

      {/* Call Transfer */}
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
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 bg-white"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Version History panel ────────────────────────────────────────────────────

function VersionHistory({
  configs, personaId, onLoad, activateConfig,
}: {
  configs: PersonaConfig[];
  personaId: PersonaId;
  onLoad: (c: PersonaConfig) => void;
  activateConfig: ReturnType<typeof useActivateConfig>;
}) {
  const list = configs.filter((c) => c.personaId === personaId).sort((a, b) => b.version - a.version);
  if (list.length === 0) return null;

  return (
    <div className="px-6 pb-6">
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

// ─── Agent Editor Drawer ──────────────────────────────────────────────────────

function AgentEditorDrawer({
  personaId, configs, onClose,
}: {
  personaId: PersonaId;
  configs: PersonaConfig[];
  onClose: () => void;
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

  function loadVersion(cfg: PersonaConfig) {
    setSystemPrompt(cfg.systemPrompt);
    setVoiceConfig({ ...DEFAULT_VOICE_CONFIG, voiceId: meta.defaultVoiceId, ...(cfg.voiceConfig ?? {}) });
  }

  async function handleSave() {
    const result = await createConfig.mutateAsync({ personaId, systemPrompt, voiceConfig });
    await activateConfig.mutateAsync(result.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-200" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Phone size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">{meta.name}</h2>
              <p className="text-xs text-slate-500">{meta.role} · {meta.trigger}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle size={12} /> Saved
              </span>
            )}
            {(createConfig.isError || activateConfig.isError) && (
              <span className="flex items-center gap-1 text-xs text-rose-600">
                <AlertCircle size={12} /> Failed
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
              Save & Activate
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 flex-shrink-0">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={Settings2} label="Overview" />
          <TabButton active={tab === 'voice'}    onClick={() => setTab('voice')}    icon={Volume2}   label="Voice & AI" />
          <TabButton active={tab === 'behavior'} onClick={() => setTab('behavior')} icon={Zap}        label="Behavior" />
        </div>

        {/* Body */}
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
              onLoad={loadVersion}
              activateConfig={activateConfig}
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Persona Cards ────────────────────────────────────────────────────────────

export function PersonaCards() {
  const { data } = useVoiceAgentConfigs();
  const [openPersona, setOpenPersona] = useState<PersonaId | null>(null);
  const configs = data ?? [];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PERSONAS.map((personaId) => {
          const meta = PERSONA_META[personaId]!;
          const activeConfig = configs.find((c) => c.personaId === personaId && c.isActive);
          const vc = activeConfig?.voiceConfig as VoiceConfig | undefined;

          return (
            <button
              key={personaId}
              onClick={() => setOpenPersona(personaId)}
              className="bg-white rounded-xl border border-border p-5 text-left hover:border-primary/40 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Phone size={16} className="text-primary" />
                </div>
                <div className="flex items-center gap-2">
                  {activeConfig ? (
                    <span className="flex items-center gap-1 text-xs text-success font-medium">
                      <CheckCircle size={12} /> Active
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Not configured</span>
                  )}
                  <ChevronRight size={14} className="text-slate-300 group-hover:text-primary transition-colors" />
                </div>
              </div>
              <p className="text-sm font-semibold text-slate-800">{meta.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{meta.role}</p>

              {activeConfig && vc && (
                <div className="mt-3 pt-2 border-t border-slate-100 grid grid-cols-3 gap-1">
                  <div className="text-center">
                    <p className="text-xs text-slate-400">STT</p>
                    <p className="text-xs font-medium text-slate-600 truncate capitalize">{vc.sttProvider ?? 'sarvam'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400">LLM</p>
                    <p className="text-xs font-medium text-slate-600 truncate">
                      {(vc.llmProvider ?? 'gemini').split('/').pop()?.replace('gemini-2.5-flash', 'Gemini') ?? 'Gemini'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400">TTS</p>
                    <p className="text-xs font-medium text-slate-600 truncate capitalize">{vc.ttsProvider ?? 'elevenlabs'}</p>
                  </div>
                </div>
              )}

              {!activeConfig && (
                <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-100">
                  {meta.trigger} · Click to configure
                </p>
              )}
              {activeConfig && !vc && (
                <p className="text-xs text-slate-400 mt-2">v{activeConfig.version} · Click to edit</p>
              )}
            </button>
          );
        })}
      </div>

      {openPersona && (
        <AgentEditorDrawer
          personaId={openPersona}
          configs={configs}
          onClose={() => setOpenPersona(null)}
        />
      )}
    </>
  );
}
