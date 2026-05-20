import type { Job } from 'bullmq';
import axios from 'axios';
import { prisma, withSystemContext } from '@excess/db';
import { env } from '@excess/config';

export interface VoiceDialPayload {
  leadId: string;
  tenantId: string;
  personaId: string;
}

const PERSONA_TO_ENV_KEY = {
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

  if (!['NEW', 'FOLLOW_UP', 'NOT_ANSWERED'].includes(lead.stage)) {
    await job.log(`Lead ${leadId} stage=${lead.stage}, skipping dial`);
    return;
  }

  const personaKey = personaId as PersonaKey;
  const personaConfig = PERSONA_TO_ENV_KEY[personaKey];
  const assistantId = personaConfig?.assistantId;
  const phoneNumberId = personaConfig?.phoneNumberId;

  if (!assistantId || !phoneNumberId) {
    throw new Error(`Missing VAPI config for persona=${personaId}`);
  }

  if (!env.VAPI_API_KEY) {
    throw new Error('VAPI_API_KEY is not set');
  }

  // Prompt A/B test — split to a B-variant assistant by per-persona percentage
  let abVariant: string | null = null;
  let chosenAssistantId: string = assistantId;
  const settings = await withSystemContext(prisma, tenantId, (tx) =>
    tx.voiceAgentSettings.findUnique({
      where: { tenantId },
      select: { abTestConfig: true },
    }),
  );
  const abConfig = (settings?.abTestConfig ?? {}) as Record<string, number>;
  const splitPercent = Number(abConfig[personaId] ?? 0);
  if (splitPercent > 0 && personaConfig.assistantIdB) {
    const useB = Math.random() * 100 < splitPercent;
    abVariant = useB ? 'B' : 'A';
    if (useB) chosenAssistantId = personaConfig.assistantIdB;
  }

  const { data } = await axios.post(
    'https://api.vapi.ai/call/phone',
    {
      assistantId: chosenAssistantId,
      customer: { number: lead.phone, name: lead.name },
      phoneNumberId,
    },
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

  await job.log(`Call initiated vapiCallId=${data.id}${abVariant ? ` variant=${abVariant}` : ''}`);
}
