'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, CheckCircle, X, ChevronRight, Clock, Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '@/lib/api';

interface PersonaConfig {
  id: string;
  personaId: string;
  version: number;
  isActive: boolean;
  activatedAt: string | null;
  createdAt: string;
  systemPrompt: string;
}

const PERSONA_META: Record<string, { name: string; role: string; trigger: string }> = {
  RESHMA_VERIFY: {
    name: 'Reshma · Verify',
    role: 'Lead Verification',
    trigger: 'New lead arrives',
  },
  KARTHIK_SALES: {
    name: 'Karthik · Sales',
    role: 'Sales Conversion',
    trigger: 'Lead qualified → +30 min',
  },
  RESHMA_FOLLOWUP: {
    name: 'Reshma · Follow-up',
    role: 'Re-engagement',
    trigger: 'Scheduled follow-up time',
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
   - If no answer / voicemail → do nothing (system handles retry)

TONE: Warm, helpful, not pushy. Keep calls under 3 minutes.`,

  KARTHIK_SALES: `You are Karthik, a confident and knowledgeable solar sales consultant at Excess Renew.

OBJECTIVE: Convert qualified leads into committed customers by presenting tailored solar proposals.

LANGUAGE: Match the customer's language (Tamil or English).

SCRIPT:
1. Greet: "Hello [name], this is Karthik from Excess Renew Solar. Reshma from our team mentioned you're interested in a solar installation — congratulations on taking this step!"
2. Confirm details from verification call (property type, electricity bill, location).
3. Present solution:
   - System size recommendation based on bill
   - Savings estimate (mention payback period: typically 3-4 years)
   - Current government subsidy available (PM-KUSUM or state scheme)
   - Highlight: 500+ installations, 25-year panel warranty, in-house installation team
4. Address objections:
   - "Too expensive" → explain EMI options and savings
   - "Need to think" → offer a free site survey with no obligation
5. Close:
   - If ready → schedule site survey: call scheduleFollowUp
   - If needs time → set a callback: call scheduleFollowUp
   - If not interested → call updateLeadStage("INVALID")

TONE: Consultative, confident. Never pushy. Keep under 5 minutes.`,

  RESHMA_FOLLOWUP: `You are Reshma, a friendly follow-up executive at Excess Renew Solar.

OBJECTIVE: Re-engage leads who requested a follow-up or went cold after initial contact.

LANGUAGE: Match the customer's language (Tamil or English).

SCRIPT:
1. Greet: "Hello [name], this is Reshma from Excess Renew Solar. I'm calling as we had scheduled — hope this is a good time?"
2. Reference the previous conversation: "Last time you mentioned [context from previous call]."
3. Check their current interest level:
   - Still interested → re-qualify and connect with Karthik
   - Needs more time → reschedule: call scheduleFollowUp
   - Not interested anymore → call updateLeadStage("INVALID")
4. If re-qualified → call updateLeadStage("QUALIFIED")

TONE: Warm, patient. Remember they already know us — keep it conversational.`,
};

const PERSONAS = ['RESHMA_VERIFY', 'KARTHIK_SALES', 'RESHMA_FOLLOWUP'] as const;

type PersonaId = (typeof PERSONAS)[number];

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
    mutationFn: (body: { personaId: string; systemPrompt: string }) =>
      api.post<{ data: PersonaConfig }>('/voice-agent/configs', body).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voice-agent-configs'] }),
  });
}

function useActivateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/voice-agent/configs/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voice-agent-configs'] }),
  });
}

// ─── Prompt editor drawer ─────────────────────────────────────────────────────

function PromptEditorDrawer({
  personaId,
  configs,
  onClose,
}: {
  personaId: PersonaId;
  configs: PersonaConfig[];
  onClose: () => void;
}) {
  const meta = PERSONA_META[personaId];
  const personaConfigs = configs
    .filter((c) => c.personaId === personaId)
    .sort((a, b) => b.version - a.version);
  const activeConfig = personaConfigs.find((c) => c.isActive);
  const defaultPrompt = DEFAULT_PROMPTS[personaId] ?? '';

  const [draftPrompt, setDraftPrompt] = useState(activeConfig?.systemPrompt ?? defaultPrompt);
  const [saved, setSaved] = useState(false);

  const createConfig = useCreateConfig();
  const activateConfig = useActivateConfig();

  const isDirty = draftPrompt !== (activeConfig?.systemPrompt ?? defaultPrompt);

  async function handleSave() {
    const result = await createConfig.mutateAsync({ personaId, systemPrompt: draftPrompt });
    await activateConfig.mutateAsync(result.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Phone size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">{meta?.name}</h2>
              <p className="text-xs text-slate-500">{meta?.role}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Prompt editor */}
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-slate-700">System Prompt</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {activeConfig
                    ? `Active: v${activeConfig.version} — edit below to save a new version`
                    : 'No version saved yet — this is the default prompt'}
                </p>
              </div>
              {saved && (
                <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                  <CheckCircle size={12} /> Saved & activated
                </span>
              )}
            </div>
            <textarea
              className="w-full h-72 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg p-4 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 text-slate-700 leading-relaxed"
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              spellCheck={false}
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-slate-400">{draftPrompt.length} characters</p>
              <button
                onClick={handleSave}
                disabled={!isDirty || createConfig.isPending || activateConfig.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
              >
                {(createConfig.isPending || activateConfig.isPending) && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                Save as new version & activate
              </button>
            </div>
            {(createConfig.isError || activateConfig.isError) && (
              <div className="mt-2 flex items-center gap-2 text-xs text-rose-600">
                <AlertCircle size={12} />
                Failed to save. Please try again.
              </div>
            )}
          </div>

          {/* Version history */}
          <div className="p-6">
            <p className="text-sm font-medium text-slate-700 mb-3">Version History</p>
            {personaConfigs.length === 0 ? (
              <p className="text-sm text-slate-400">No saved versions yet.</p>
            ) : (
              <div className="space-y-2">
                {personaConfigs.map((cfg) => (
                  <div
                    key={cfg.id}
                    className={`rounded-lg border p-4 ${
                      cfg.isActive
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
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
                          {format(new Date(cfg.createdAt), 'dd MMM yyyy, HH:mm')}
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
                          onClick={() => setDraftPrompt(cfg.systemPrompt)}
                          className="text-xs text-slate-500 hover:text-slate-700 font-medium hover:underline"
                        >
                          Load
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 font-mono line-clamp-2 leading-relaxed">
                      {cfg.systemPrompt.slice(0, 160)}…
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Persona cards ────────────────────────────────────────────────────────────

export function PersonaCards() {
  const { data } = useVoiceAgentConfigs();
  const [openPersona, setOpenPersona] = useState<PersonaId | null>(null);
  const configs = data ?? [];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PERSONAS.map((personaId) => {
          const meta = PERSONA_META[personaId] ?? { name: personaId, role: '', trigger: '' };
          const activeConfig = configs.find((c) => c.personaId === personaId && c.isActive);

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
                  <ChevronRight
                    size={14}
                    className="text-slate-300 group-hover:text-primary transition-colors"
                  />
                </div>
              </div>
              <p className="text-sm font-semibold text-slate-800">{meta.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{meta.role}</p>
              <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-100">
                {meta.trigger}
              </p>
              {activeConfig ? (
                <p className="text-xs text-slate-400 mt-1">v{activeConfig.version} · Click to edit prompt</p>
              ) : (
                <p className="text-xs text-slate-400 mt-1">Click to set up prompt</p>
              )}
            </button>
          );
        })}
      </div>

      {openPersona && (
        <PromptEditorDrawer
          personaId={openPersona}
          configs={configs}
          onClose={() => setOpenPersona(null)}
        />
      )}
    </>
  );
}
