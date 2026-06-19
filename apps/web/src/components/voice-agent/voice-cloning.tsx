'use client';

import { useState, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Mic, Trash2, Copy, Check, Plus, Play, Pause, X, Loader2,
  AlertCircle, Upload, Wand2, Info,
} from 'lucide-react';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  preview_url: string | null;
  labels: Record<string, string>;
  description: string | null;
}

interface PersonaConfig {
  id: string;
  personaId: string;
  systemPrompt: string;
  isActive: boolean;
  voiceConfig: { voiceId?: string } | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useVoices() {
  return useQuery({
    queryKey: ['elevenlabs-voices'],
    queryFn: () =>
      api.get<{ data: ElevenLabsVoice[] }>('/voice-agent/voices').then((r) => r.data.data),
    staleTime: 60_000,
  });
}

function useCreateVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) =>
      api.post<{ data: { voiceId: string } }>('/voice-agent/voices', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['elevenlabs-voices'] }),
  });
}

function useDeleteVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (voiceId: string) => api.delete(`/voice-agent/voices/${voiceId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['elevenlabs-voices'] }),
  });
}

function usePersonaConfigs() {
  return useQuery({
    queryKey: ['voice-agent-configs'],
    queryFn: () =>
      api.get<{ data: PersonaConfig[] }>('/voice-agent/configs').then((r) => r.data.data),
  });
}

function useAssignVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ voiceId, personaId, configs }: { voiceId: string; personaId: string; configs: PersonaConfig[] }) => {
      const active = configs.find((c) => c.personaId === personaId && c.isActive);
      const created = await api.post<{ data: { id: string } }>('/voice-agent/configs', {
        personaId,
        systemPrompt: active?.systemPrompt ?? '',
        voiceConfig: { ...active?.voiceConfig, voiceId },
      }).then((r) => r.data.data);
      await api.post(`/voice-agent/configs/${created.id}/activate`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voice-agent-configs'] }),
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VoicePreviewButton({ previewUrl }: { previewUrl: string | null }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = useCallback(() => {
    if (!previewUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(previewUrl);
      audioRef.current.onended = () => setPlaying(false);
    }

    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => setPlaying(false));
      setPlaying(true);
    }
  }, [previewUrl, playing]);

  if (!previewUrl) {
    return (
      <button disabled className="p-1.5 rounded-lg text-slate-300 cursor-not-allowed" title="No preview available">
        <Play size={13} />
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-primary transition-colors"
      title={playing ? 'Stop preview' : 'Play preview'}
    >
      {playing ? <Pause size={13} /> : <Play size={13} />}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-primary transition-colors"
      title="Copy voice ID"
    >
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  );
}

const PERSONA_LABELS: Record<string, string> = {
  RESHMA_VERIFY: 'Reshma · Verify',
  KARTHIK_SALES: 'Karthik · Sales',
  RESHMA_FOLLOWUP: 'Reshma · Follow-up',
};

function VoiceCard({
  voice,
  usedBy,
  onDelete,
  onAssign,
  isDeleting,
  isAssigning,
}: {
  voice: ElevenLabsVoice;
  usedBy: string[];
  onDelete: () => void;
  onAssign: (personaId: string) => void;
  isDeleting: boolean;
  isAssigning: boolean;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isCloned = voice.category === 'cloned';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`flex-shrink-0 p-2 rounded-lg ${isCloned ? 'bg-violet-100' : 'bg-amber-100'}`}>
            <Mic size={14} className={isCloned ? 'text-violet-600' : 'text-amber-600'} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{voice.name}</p>
            <p className="text-xs text-slate-400 font-mono truncate">{voice.voice_id}</p>
          </div>
        </div>
        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
          isCloned ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {isCloned ? 'Cloned' : 'Premade'}
        </span>
      </div>

      {/* "Used by" badges */}
      {usedBy.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {usedBy.map((p) => (
            <span key={p} className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              <Check size={10} /> {PERSONA_LABELS[p] ?? p}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        <div className="flex items-center gap-1">
          <VoicePreviewButton previewUrl={voice.preview_url} />
          <CopyButton text={voice.voice_id} />
        </div>

        <div className="flex items-center gap-1.5">
          {/* Assign button */}
          <div className="relative">
            <button
              onClick={() => setShowAssign((v) => !v)}
              disabled={isAssigning}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
            >
              {isAssigning ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Assign
            </button>
            {showAssign && (
              <div className="absolute right-0 bottom-full mb-1 z-10 bg-white rounded-xl border border-slate-200 shadow-lg py-1 w-48">
                {Object.entries(PERSONA_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { onAssign(key); setShowAssign(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Delete button — only cloned voices */}
          {isCloned && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={isDeleting}
              className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-50"
              title="Delete voice"
            >
              {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          )}
          {isCloned && confirmDelete && (
            <div className="flex items-center gap-1">
              <button
                onClick={onDelete}
                className="text-xs px-2 py-1 rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Upload Form ──────────────────────────────────────────────────────────────

function UploadVoiceForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createVoice = useCreateVoice();

  const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/m4a', 'audio/ogg', 'audio/flac'];

  function addFiles(newFiles: FileList | File[]) {
    const arr = Array.from(newFiles).filter((f) => ACCEPTED_TYPES.includes(f.type) || f.name.match(/\.(mp3|wav|m4a|ogg|flac|mp4)$/i));
    setFiles((prev) => {
      const combined = [...prev, ...arr];
      return combined.slice(0, 25);
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || files.length === 0) return;

    const form = new FormData();
    form.append('name', name.trim());
    if (description.trim()) form.append('description', description.trim());
    for (const f of files) form.append('files', f);

    await createVoice.mutateAsync(form);
    onClose();
  }

  const totalMB = (files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Voice Name</label>
        <input
          type="text"
          placeholder="e.g. Selvi – Tamil Female"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Description <span className="normal-case font-normal text-slate-400">(optional)</span></label>
        <input
          type="text"
          placeholder="e.g. Cloned from voice samples"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
        />
      </div>

      {/* File drop zone */}
      <div>
        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
          Audio Samples <span className="normal-case font-normal text-slate-400">up to 25 files · mp3 wav m4a ogg flac</span>
        </label>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300 bg-slate-50'
          }`}
        >
          <Upload size={20} className="mx-auto mb-2 text-slate-400" />
          <p className="text-sm text-slate-600">Drop audio files here or <span className="text-primary font-medium">browse</span></p>
          <p className="text-xs text-slate-400 mt-1">Minimum 1 minute of clean audio per voice. More = better quality.</p>
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.wav,.m4a,.ogg,.flac,.mp4,audio/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Mic size={12} className="text-slate-400 flex-shrink-0" />
                  <span className="truncate text-slate-700">{f.name}</span>
                  <span className="text-slate-400 flex-shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
                <button type="button" onClick={() => removeFile(i)} className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
                  <X size={11} />
                </button>
              </div>
            ))}
            <p className="text-xs text-slate-400 px-1">{files.length} file{files.length !== 1 ? 's' : ''} · {totalMB} MB total</p>
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 rounded-lg border border-blue-100">
        <Info size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Use clear, noise-free recordings with natural speech. Avoid music or background noise. ElevenLabs recommends at least 1 minute total for Instant Cloning, 30 minutes for Professional Cloning.
        </p>
      </div>

      {createVoice.isError && (
        <div className="flex items-center gap-2 text-sm text-rose-600">
          <AlertCircle size={14} />
          <span>{(createVoice.error as Error).message ?? 'Failed to create voice. Please try again.'}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim() || files.length === 0 || createVoice.isPending}
          className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {createVoice.isPending ? (
            <><Loader2 size={14} className="animate-spin" /> Cloning voice…</>
          ) : (
            <><Wand2 size={14} /> Clone Voice</>
          )}
        </button>
      </div>
    </form>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function VoiceCloningPanel() {
  const [showForm, setShowForm] = useState(false);
  const { data: voices, isLoading, isError, error } = useVoices();
  const { data: configs } = usePersonaConfigs();
  const deleteVoice = useDeleteVoice();
  const assignVoice = useAssignVoice();

  const notConfigured =
    isError && (error as { response?: { status?: number } })?.response?.status === 503;

  // Build map: voice_id → persona IDs that use it
  const voiceUsage = new Map<string, string[]>();
  if (configs) {
    for (const cfg of configs) {
      if (cfg.isActive && cfg.voiceConfig?.voiceId) {
        const id = cfg.voiceConfig.voiceId;
        voiceUsage.set(id, [...(voiceUsage.get(id) ?? []), cfg.personaId]);
      }
    }
  }

  // Separate cloned from premade, show cloned first
  const cloned = (voices ?? []).filter((v) => v.category === 'cloned');
  const premade = (voices ?? []).filter((v) => v.category !== 'cloned');

  return (
    <div className="bg-white rounded-xl border border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-100 rounded-lg">
            <Mic size={16} className="text-violet-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-800">Voice Cloning</h2>
            <p className="text-xs text-slate-500 mt-0.5">Upload audio samples to clone a voice · Powered by ElevenLabs</p>
          </div>
        </div>
        {!showForm && !notConfigured && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} /> Clone New Voice
          </button>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Upload Form */}
        {showForm && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Wand2 size={14} className="text-primary" /> Create Cloned Voice
            </h3>
            <UploadVoiceForm onClose={() => setShowForm(false)} />
          </div>
        )}

        {/* Not configured */}
        {notConfigured && (
          <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 rounded-xl border border-amber-200">
            <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">ElevenLabs API key not configured</p>
              <p className="text-xs text-amber-600 mt-0.5">Add <code className="font-mono">ELEVENLABS_API_KEY</code> to your environment variables to enable voice cloning.</p>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Cloned voices */}
        {cloned.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Your Cloned Voices</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cloned.map((voice) => (
                <VoiceCard
                  key={voice.voice_id}
                  voice={voice}
                  usedBy={voiceUsage.get(voice.voice_id) ?? []}
                  onDelete={() => deleteVoice.mutate(voice.voice_id)}
                  onAssign={(personaId) =>
                    assignVoice.mutate({ voiceId: voice.voice_id, personaId, configs: configs ?? [] })
                  }
                  isDeleting={deleteVoice.isPending && deleteVoice.variables === voice.voice_id}
                  isAssigning={assignVoice.isPending}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty cloned state */}
        {!isLoading && !notConfigured && cloned.length === 0 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-violet-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Mic size={20} className="text-violet-500" />
            </div>
            <p className="text-sm font-medium text-slate-700">No cloned voices yet</p>
            <p className="text-xs text-slate-400 mt-1">Click &quot;Clone New Voice&quot; to upload audio samples and create a custom voice.</p>
          </div>
        )}

        {/* Premade voices (collapsed by default) */}
        {premade.length > 0 && <PremadeVoicesSection voices={premade} voiceUsage={voiceUsage} onAssign={(voiceId, personaId) => assignVoice.mutate({ voiceId, personaId, configs: configs ?? [] })} isAssigning={assignVoice.isPending} />}
      </div>
    </div>
  );
}

// ─── Premade Voices (collapsible) ─────────────────────────────────────────────

function PremadeVoicesSection({
  voices,
  voiceUsage,
  onAssign,
  isAssigning,
}: {
  voices: ElevenLabsVoice[];
  voiceUsage: Map<string, string[]>;
  onAssign: (voiceId: string, personaId: string) => void;
  isAssigning: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-slate-100 pt-4">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-700 uppercase tracking-wide transition-colors"
      >
        <span>{expanded ? '▾' : '▸'}</span>
        ElevenLabs Stock Voices ({voices.length})
      </button>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {voices.map((voice) => (
            <VoiceCard
              key={voice.voice_id}
              voice={voice}
              usedBy={voiceUsage.get(voice.voice_id) ?? []}
              onDelete={() => {}}
              onAssign={(personaId) => onAssign(voice.voice_id, personaId)}
              isDeleting={false}
              isAssigning={isAssigning}
            />
          ))}
        </div>
      )}
    </div>
  );
}
