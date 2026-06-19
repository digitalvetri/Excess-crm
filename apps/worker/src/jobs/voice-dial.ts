import type { Job } from 'bullmq';
import axios from 'axios';
import { RoomServiceClient, SipClient } from 'livekit-server-sdk';
import { prisma, withSystemContext } from '@excess/db';
import { env } from '@excess/config';

export interface VoiceDialPayload {
  leadId: string;
  tenantId: string;
  personaId: string;
}

const PERSONA_TO_ENV_KEY = {
  EXCESS_AGENT: {
    assistantId: env.VAPI_ASSISTANT_ID_EXCESS_AGENT,
    assistantIdB: env.VAPI_ASSISTANT_ID_EXCESS_AGENT_B,
    phoneNumberId: env.VAPI_PHONE_NUMBER_ID_EXCESS_AGENT,
  },
  // Legacy personas — kept for backward compat with existing call records
  RESHMA_VERIFY: {
    assistantId: env.VAPI_ASSISTANT_ID_RESHMA_VERIFY,
    assistantIdB: env.VAPI_ASSISTANT_ID_RESHMA_VERIFY_B,
    phoneNumberId: env.VAPI_PHONE_NUMBER_ID_RESHMA_VERIFY,
  },
  KARTHIK_SALES: {
    assistantId: env.VAPI_ASSISTANT_ID_KARTHIK_SALES,
    assistantIdB: env.VAPI_ASSISTANT_ID_KARTHIK_SALES_B,
    phoneNumberId: env.VAPI_PHONE_NUMBER_ID_KARTHIK_SALES,
  },
  RESHMA_FOLLOWUP: {
    assistantId: env.VAPI_ASSISTANT_ID_RESHMA_FOLLOWUP,
    assistantIdB: env.VAPI_ASSISTANT_ID_RESHMA_FOLLOWUP_B,
    phoneNumberId: env.VAPI_PHONE_NUMBER_ID_RESHMA_FOLLOWUP,
  },
} as const;

type PersonaKey = keyof typeof PERSONA_TO_ENV_KEY;

interface SavedVoiceConfig {
  firstMessage?: string;
  language?: string;
  sttProvider?: string;
  llmProvider?: string;
  ttsProvider?: string;
  voiceId?: string;
  responseTiming?: string;
  voiceSpeed?: number;
  allowInterruptions?: boolean;
  maxDurationSec?: number;
  idleTimeoutSec?: number;
  idleTurns?: number;
  callTransfer?: { enabled: boolean; number: string };
}

// ─── Tool definitions per persona ─────────────────────────────────────────────
// All tools point to our /webhooks/vapi endpoint. Vapi calls it for function-calls.

function buildTools(personaKey: PersonaKey, webhookUrl: string): unknown[] {
  const server = { url: webhookUrl, ...(env.VAPI_WEBHOOK_SECRET && { secret: env.VAPI_WEBHOOK_SECRET }) };

  const getLeadInfo = {
    type: 'function',
    function: {
      name: 'getLeadInfo',
      description: 'Fetch lead details at the start of the call',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    server,
  };

  const updateLeadStage = {
    type: 'function',
    function: {
      name: 'updateLeadStage',
      description: 'Update the lead stage based on the call outcome',
      parameters: {
        type: 'object',
        properties: {
          stage: {
            type: 'string',
            enum: ['QUALIFIED', 'NOT_ANSWERED', 'INVALID', 'WRONG_ENQUIRY', 'FOLLOW_UP', 'CONVERTED'],
          },
          scheduledAt: { type: 'string', description: 'ISO 8601 datetime if scheduling a follow-up' },
        },
        required: ['stage'],
      },
    },
    server,
  };

  const scheduleFollowUp = {
    type: 'function',
    function: {
      name: 'scheduleFollowUp',
      description: 'Schedule a follow-up call at a time the customer requested',
      parameters: {
        type: 'object',
        properties: {
          scheduledAt: { type: 'string', description: 'ISO 8601 datetime e.g. 2024-06-15T10:00:00+05:30' },
        },
        required: ['scheduledAt'],
      },
    },
    server,
  };

  const getProductInfo = {
    type: 'function',
    function: {
      name: 'getProductInfo',
      description: 'Get solar product catalogue info for a category',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['residential', 'commercial', 'industrial', 'offgrid'] },
        },
        required: ['category'],
      },
    },
    server,
  };

  const scheduleAppointment = {
    type: 'function',
    function: {
      name: 'scheduleAppointment',
      description: 'Book a site survey appointment',
      parameters: {
        type: 'object',
        properties: {
          scheduledAt: { type: 'string' },
          siteAddress: { type: 'string' },
          surveyType: { type: 'string', enum: ['ROOFTOP_RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'OFFGRID'] },
        },
        required: ['scheduledAt', 'siteAddress', 'surveyType'],
      },
    },
    server,
  };

  const getFollowUpContext = {
    type: 'function',
    function: {
      name: 'getFollowUpContext',
      description: 'Get previous call history and activities for the lead',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    server,
  };

  const updateConversionStatus = {
    type: 'function',
    function: {
      name: 'updateConversionStatus',
      description: 'Mark final outcome — CONVERTED, INVALID, or RESCHEDULED',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['CONVERTED', 'INVALID', 'RESCHEDULED'] },
        },
        required: ['status'],
      },
    },
    server,
  };

  const rescheduleFollowUp = {
    type: 'function',
    function: {
      name: 'rescheduleFollowUp',
      description: 'Reschedule a follow-up call',
      parameters: {
        type: 'object',
        properties: {
          scheduledAt: { type: 'string' },
        },
        required: ['scheduledAt'],
      },
    },
    server,
  };

  switch (personaKey) {
    case 'EXCESS_AGENT':
      // Single unified agent — gets all tools; uses getLeadInfo stage to decide behaviour
      return [getLeadInfo, getFollowUpContext, updateLeadStage, scheduleFollowUp, getProductInfo, scheduleAppointment];
    case 'RESHMA_VERIFY':
      return [getLeadInfo, updateLeadStage, scheduleFollowUp, getProductInfo];
    case 'KARTHIK_SALES':
      return [getLeadInfo, updateLeadStage, scheduleAppointment, getProductInfo, scheduleFollowUp];
    case 'RESHMA_FOLLOWUP':
      return [getLeadInfo, getFollowUpContext, updateConversionStatus, rescheduleFollowUp, scheduleFollowUp];
  }
}

// ─── Build Vapi transcriber from saved STT config ─────────────────────────────

function buildTranscriber(sttProvider: string, language: string): Record<string, unknown> {
  const lang = language === 'ta' ? 'ta-IN' : language === 'en' ? 'en-IN' : 'ta-IN';

  switch (sttProvider) {
    case 'sarvam':
      return { provider: 'sarvam', model: 'sarvam-2b', language: lang };
    case 'deepgram':
      return { provider: 'deepgram', model: 'nova-3-general', language: lang === 'ta-IN' ? 'ta' : 'en-IN' };
    case 'google':
      return { provider: 'google', model: 'latest_long', language: lang };
    default:
      return { provider: 'sarvam', model: 'sarvam-2b', language: 'ta-IN' };
  }
}

// ─── Build Vapi model from saved LLM config ───────────────────────────────────

function buildModel(
  llmProvider: string,
  systemPrompt: string,
  tools: unknown[],
): Record<string, unknown> {
  const parts = llmProvider.split('/');
  const provider = parts.length === 2 ? parts[0] : 'google';
  const model = parts.length === 2 ? (parts[1] ?? 'gemini-2.5-flash-preview-04-17') : llmProvider;

  const providerMap: Record<string, string> = {
    google: 'google',
    openai: 'openai',
    anthropic: 'anthropic',
  };

  return {
    provider: (provider ? providerMap[provider] : undefined) ?? 'google',
    model,
    messages: [{ role: 'system', content: systemPrompt }],
    tools,
  };
}

// ─── Build Vapi voice from saved TTS config ───────────────────────────────────

function buildVoice(ttsProvider: string, voiceId: string, speed: number): Record<string, unknown> {
  switch (ttsProvider) {
    case 'elevenlabs':
      return {
        provider: '11labs',
        voiceId,
        speed,
        stability: 0.5,
        similarityBoost: 0.75,
        style: 0.0,
        useSpeakerBoost: true,
      };
    case 'azure':
      return { provider: 'azure', voiceId, speed };
    default:
      return { provider: '11labs', voiceId, speed, stability: 0.5, similarityBoost: 0.75 };
  }
}

// ─── Build full inline Vapi assistant from DB config ─────────────────────────

function buildAssistantPayload(
  personaKey: PersonaKey,
  systemPrompt: string,
  vc: SavedVoiceConfig,
): Record<string, unknown> {
  const webhookUrl = `${env.API_URL}/api/v1/webhooks/vapi`;
  const tools = buildTools(personaKey, webhookUrl);

  const sttProvider = vc.sttProvider ?? 'sarvam';
  const llmProvider = vc.llmProvider ?? 'google/gemini-2.5-flash-preview-04-17';
  const ttsProvider = vc.ttsProvider ?? 'elevenlabs';

  const defaultVoiceId = personaKey === 'KARTHIK_SALES' ? 'edapadi' : 'EXAVITQu4vr4xnSDxMaL';
  const voiceId = vc.voiceId && vc.voiceId !== 'custom' ? vc.voiceId : defaultVoiceId;
  const voiceSpeed = vc.voiceSpeed ?? 1.0;
  const language = vc.language ?? 'ta';

  const endpointingMs =
    vc.responseTiming === 'low_latency' ? 100 :
    vc.responseTiming === 'conservative' ? 500 :
    300;

  return {
    transcriber: buildTranscriber(sttProvider, language),
    model: buildModel(llmProvider, systemPrompt, tools),
    voice: buildVoice(ttsProvider, voiceId, voiceSpeed),
    ...(vc.firstMessage && { firstMessage: vc.firstMessage }),
    silenceTimeoutSeconds: vc.idleTimeoutSec ?? 15,
    maxDurationSeconds: vc.maxDurationSec ?? 300,
    backgroundDenoisingEnabled: true,
    endpointing: endpointingMs,
    clientMessages: ['transcript', 'hang', 'function-call', 'speech-update'],
    serverMessages: ['end-of-call-report', 'status-update', 'hang', 'function-call'],
    serverUrl: webhookUrl,
    ...(env.VAPI_WEBHOOK_SECRET && { serverUrlSecret: env.VAPI_WEBHOOK_SECRET }),
  };
}

// ─── Main worker ──────────────────────────────────────────────────────────────

export async function processVoiceDial(job: Job<VoiceDialPayload>): Promise<void> {
  const { leadId, tenantId, personaId } = job.data;

  const lead = await withSystemContext(prisma, tenantId, (tx) =>
    tx.lead.findUnique({
      where: { id: leadId },
      select: { id: true, phone: true, name: true, stage: true, tenantId: true },
    }),
  );

  if (!lead || lead.tenantId !== tenantId) {
    throw new Error(`Lead ${leadId} not found`);
  }

  const dialableStages = ['NEW', 'FOLLOW_UP', 'NOT_ANSWERED', 'QUALIFIED'];
  if (!dialableStages.includes(lead.stage)) {
    await job.log(`Lead ${leadId} stage=${lead.stage}, skipping dial`);
    return;
  }

  // L3: Meta leads arrive with phone="" until Graph API enrichment runs — skip rather than retry-storm
  if (!lead.phone) {
    await job.log(`Lead ${leadId} has no phone number (pending enrichment), skipping dial`);
    return;
  }

  // Re-check DND list before every dial — the weekly scrub may have added this number
  // after the lead was ingested. dnd_list has no RLS so we query prisma directly.
  const dnd = await prisma.dndList.findFirst({ where: { phone: lead.phone } });
  if (dnd) {
    await job.log(`Lead ${leadId} phone is on DND list — aborting dial (TRAI compliance)`);
    return;
  }

  if (!env.ENABLE_LIVEKIT && !env.VAPI_API_KEY) {
    throw new Error('Neither LIVEKIT nor VAPI is configured — set ENABLE_LIVEKIT=true or VAPI_API_KEY');
  }

  if (!env.ENABLE_AI_DIAL) {
    await job.log('AI dialing disabled (ENABLE_AI_DIAL=false), skipping');
    return;
  }

  const personaKey = personaId as PersonaKey;
  const personaEnv = PERSONA_TO_ENV_KEY[personaKey];
  const phoneNumberId = personaEnv?.phoneNumberId;

  // phoneNumberId is only required for the Vapi path — LiveKit does not use it
  if (!env.ENABLE_LIVEKIT && !phoneNumberId) {
    throw new Error(`VAPI_PHONE_NUMBER_ID not configured for persona=${personaId}`);
  }

  // Fetch per-tenant settings (daily cap)
  const settings = await withSystemContext(prisma, tenantId, (tx) =>
    tx.voiceAgentSettings.findUnique({
      where: { tenantId },
      select: { abTestConfig: true, dailyCallCap: true },
    }),
  );

  // Daily call cap — count outbound calls since midnight IST
  const dailyCap = settings?.dailyCallCap ?? env.DAILY_AI_CALL_CAP;
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const nowIst = new Date(Date.now() + istOffsetMs);
  const midnightIstUtc = new Date(
    Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - istOffsetMs,
  );
  const todayCount = await withSystemContext(prisma, tenantId, (tx) =>
    tx.call.count({ where: { tenantId, initiatedAt: { gte: midnightIstUtc } } }),
  );
  if (todayCount >= dailyCap) {
    await job.log(`Daily cap ${dailyCap} reached (${todayCount} calls today), skipping`);
    return;
  }

  // Fetch active persona config from DB — this is the source of truth for prompts + AI settings
  const activeConfig = await withSystemContext(prisma, tenantId, (tx) =>
    tx.voiceAgentConfig.findFirst({
      where: { tenantId, personaId: personaKey, isActive: true },
      select: { systemPrompt: true, voiceConfig: true },
    }),
  );

  // ─── LiveKit path ─────────────────────────────────────────────────────────────

  if (env.ENABLE_LIVEKIT) {
    if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set when ENABLE_LIVEKIT=true');
    }

    await job.log(`LiveKit path: persona=${personaId}`);

    // Create call record first to derive the room name
    const callRecord = await withSystemContext(prisma, tenantId, (tx) =>
      tx.call.create({
        data: {
          leadId: lead.id,
          tenantId,
          direction: 'OUTBOUND',
          status: 'QUEUED',
          persona: personaKey as 'EXCESS_AGENT' | 'RESHMA_VERIFY' | 'KARTHIK_SALES' | 'RESHMA_FOLLOWUP',
          fromNumber: env.LIVEKIT_SIP_TRUNK_ID ?? 'livekit',
          toNumber: lead.phone,
          initiatedAt: new Date(),
        },
        select: { id: true },
      }),
    );

    const roomName = `call-${callRecord.id}`;
    // Metadata: personaId:callId:leadId:tenantId — Python agent reads this on join
    const metadata = `${personaId}:${callRecord.id}:${leadId}:${tenantId}`;

    const roomService = new RoomServiceClient(
      env.LIVEKIT_URL,
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET,
    );

    await roomService.createRoom({ name: roomName, metadata, emptyTimeout: 300, maxParticipants: 10 });
    await job.log(`LiveKit room created: ${roomName}`);

    if (env.LIVEKIT_SIP_TRUNK_ID) {
      const sipClient = new SipClient(
        env.LIVEKIT_URL,
        env.LIVEKIT_API_KEY,
        env.LIVEKIT_API_SECRET,
      );

      await sipClient.createSipParticipant(env.LIVEKIT_SIP_TRUNK_ID, lead.phone, roomName, {
        participantIdentity: `sip-${lead.phone}`,
        participantName: lead.name ?? lead.phone,
      });

      await job.log(`SIP participant created for ${lead.phone} in room ${roomName}`);
    } else {
      await job.log(`No LIVEKIT_SIP_TRUNK_ID configured — room ${roomName} is ready, waiting for SIP trunk setup`);
    }

    await job.log(`LiveKit call initiated livekitRoomName=${roomName} callId=${callRecord.id}`);
    return;
  }

  // ─── Vapi path (fallback when ENABLE_LIVEKIT=false) ──────────────────────────

  if (!env.VAPI_API_KEY) {
    throw new Error('VAPI_API_KEY is not set');
  }

  if (!phoneNumberId) {
    throw new Error(`VAPI_PHONE_NUMBER_ID not configured for persona=${personaId}`);
  }

  // A/B variant tracking (only applies when using env-based assistantId)
  let abVariant: string | null = null;
  const abConfig = (settings?.abTestConfig ?? {}) as Record<string, number>;

  // Build the Vapi call payload
  let callBody: Record<string, unknown>;

  if (activeConfig) {
    // Active config in DB → build fully inline assistant (our settings are the source of truth)
    const vc = (activeConfig.voiceConfig ?? {}) as SavedVoiceConfig;
    const assistant = buildAssistantPayload(personaKey, activeConfig.systemPrompt, vc);

    callBody = { assistant, customer: { number: lead.phone, name: lead.name }, phoneNumberId };
    await job.log(`Using DB config for persona=${personaId} (stt=${vc.sttProvider ?? 'sarvam'}, llm=${vc.llmProvider ?? 'gemini-2.5-flash'}, tts=${vc.ttsProvider ?? 'elevenlabs'}, voice=${vc.voiceId ?? 'mk-tamil-v1'})`);
  } else {
    // No DB config → fall back to pre-built Vapi assistant ID from env
    const assistantId = personaEnv?.assistantId;
    if (!assistantId) {
      throw new Error(`No active config and no VAPI_ASSISTANT_ID for persona=${personaId} — configure the agent in Voice Agent Settings first`);
    }

    // Apply A/B split on env-based fallback
    let chosenAssistantId = assistantId;
    const splitPercent = Number(abConfig[personaId] ?? 0);
    if (splitPercent > 0 && personaEnv.assistantIdB) {
      const useB = Math.random() * 100 < splitPercent;
      abVariant = useB ? 'B' : 'A';
      if (useB) chosenAssistantId = personaEnv.assistantIdB;
    }

    callBody = { assistantId: chosenAssistantId, customer: { number: lead.phone, name: lead.name }, phoneNumberId };
    await job.log(`Using env assistantId=${chosenAssistantId}${abVariant ? ` variant=${abVariant}` : ''}`);
  }

  const { data } = await axios.post(
    'https://api.vapi.ai/call/phone',
    callBody,
    {
      headers: { Authorization: `Bearer ${env.VAPI_API_KEY}` },
      timeout: 10_000,
    },
  );

  await withSystemContext(prisma, tenantId, (tx) =>
    tx.call.create({
      data: {
        leadId: lead.id,
        tenantId,
        vapiCallId: data.id as string,
        direction: 'OUTBOUND',
        status: 'QUEUED',
        persona: personaKey as 'RESHMA_VERIFY' | 'KARTHIK_SALES' | 'RESHMA_FOLLOWUP',
        fromNumber: phoneNumberId,
        toNumber: lead.phone,
        initiatedAt: new Date(),
        ...(abVariant && { abVariant }),
      },
    }),
  );

  await job.log(`Call initiated vapiCallId=${data.id}`);
}
