import type { Job } from 'bullmq';
import type { CallStatus } from '@excess/db';
import { prisma, withSystemContext, SYSTEM_TENANT_ID } from '@excess/db';
import { queues } from '../queues.js';
import { scheduleRetryDial } from './retry-dial.js';

export interface CallWebhookPayload {
  eventType: string;
  vapiCallId: string;
  raw: Record<string, unknown>;
}

interface VapiCallEnded {
  call: {
    id: string;
    status: string;
    endedReason?: string;
    startedAt?: string;
    endedAt?: string;
    artifact?: {
      transcript?: string;
      recordingUrl?: string;
      messages?: unknown[];
    };
    costBreakdown?: { total?: number };
    analysis?: {
      summary?: string;
      structuredData?: Record<string, unknown>;
      successEvaluation?: string;
    };
  };
}

export async function processCallWebhook(job: Job<CallWebhookPayload>): Promise<void> {
  const { eventType, vapiCallId, raw } = job.data;

  switch (eventType) {
    case 'call-started':
      await handleCallStarted(vapiCallId);
      break;
    case 'call-ended':
      await handleCallEnded(vapiCallId, raw as unknown as VapiCallEnded);
      break;
    default:
      await job.log(`Unhandled event type: ${eventType}`);
  }
}

async function handleCallStarted(vapiCallId: string): Promise<void> {
  // Use SYSTEM_TENANT_ID — admin bypass lets us find the call across all tenants
  await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
    tx.call.updateMany({
      where: { vapiCallId },
      data: { status: 'IN_PROGRESS', connectedAt: new Date() },
    }),
  );
}

async function handleCallEnded(vapiCallId: string, payload: VapiCallEnded): Promise<void> {
  const callData = payload.call;

  // Look up call first — admin bypass scoped to SYSTEM_TENANT_ID lets us read across tenants
  const call = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
    tx.call.findUnique({
      where: { vapiCallId },
      select: { id: true, leadId: true, tenantId: true, persona: true },
    }),
  );

  if (!call) return;

  const endedAt = callData.endedAt ? new Date(callData.endedAt) : new Date();
  const startedAt = callData.startedAt ? new Date(callData.startedAt) : null;
  const durationSec = startedAt
    ? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
    : null;

  const endedReason = callData.endedReason ?? 'unknown';
  const connected = [
    'customer-ended-call',
    'assistant-ended-call',
    'silence-timed-out',
    'voicemail',
  ].includes(endedReason);

  const status: CallStatus = connected ? 'COMPLETED' : mapEndReason(endedReason);

  const newStage = deriveStageFromCallOutcome(endedReason, callData.analysis);

  await withSystemContext(prisma, call.tenantId, async (tx) => {
    await tx.call.update({
      where: { id: call.id },
      data: {
        status,
        endedAt,
        durationSec,
        endReason: endedReason,
        ...(callData.artifact?.transcript && {
          transcript: { text: callData.artifact.transcript } as object,
        }),
        ...(callData.analysis && { llmAnalysis: callData.analysis as object }),
      },
    });

    if (newStage) {
      await tx.lead.update({
        where: { id: call.leadId },
        data: { stage: newStage as never, stageChangedAt: new Date() },
      });

      await tx.leadActivity.create({
        data: {
          leadId: call.leadId,
          tenantId: call.tenantId,
          actorIsAi: true,
          type: 'STAGE_CHANGE',
          payload: {
            newStage,
            callId: call.id,
            endReason: endedReason,
            source: call.persona,
          } as object,
        },
      });
    }
  });

  // Enqueue recording download if URL present
  if (callData.artifact?.recordingUrl) {
    await queues.callWebhook.add('download-recording', {
      callId: call.id,
      tenantId: call.tenantId,
      recordingUrl: callData.artifact.recordingUrl,
    });
  }

  if (newStage === 'NOT_ANSWERED') {
    await scheduleRetryDial(call.leadId, call.tenantId, call.persona);
  }

  if (newStage === 'QUALIFIED' && call.persona === 'RESHMA_VERIFY') {
    await queues.voiceDial.add(
      'voice-dial',
      { leadId: call.leadId, tenantId: call.tenantId, personaId: 'KARTHIK_SALES' },
      { delay: 30 * 60 * 1000, priority: 1 },
    );
  }

  if (newStage === 'CONVERTED') {
    await queues.humanHandoff.add('human-handoff', {
      leadId: call.leadId,
      tenantId: call.tenantId,
    });
  }
}

function mapEndReason(reason: string): CallStatus {
  const noAnswerReasons = ['no-answer', 'busy', 'failed', 'customer-did-not-answer', 'machine-detected'];
  const failedReasons = ['error', 'pipeline-error', 'transport-error'];
  if (noAnswerReasons.some((r) => reason.includes(r))) return 'NO_ANSWER';
  if (failedReasons.some((r) => reason.includes(r))) return 'FAILED';
  return 'COMPLETED';
}

function deriveStageFromCallOutcome(
  endReason: string,
  analysis?: VapiCallEnded['call']['analysis'],
): string | null {
  if (!endReason) return null;

  const noAnswer = ['no-answer', 'busy', 'customer-did-not-answer', 'machine-detected'];
  if (noAnswer.some((r) => endReason.includes(r))) return 'NOT_ANSWERED';

  const structured = analysis?.structuredData ?? {};
  const outcome = (structured['outcome'] as string | undefined) ?? '';

  if (outcome === 'qualified') return 'QUALIFIED';
  if (outcome === 'follow_up') return 'FOLLOW_UP';
  if (outcome === 'invalid') return 'INVALID';
  if (outcome === 'wrong_enquiry') return 'WRONG_ENQUIRY';

  return null;
}
