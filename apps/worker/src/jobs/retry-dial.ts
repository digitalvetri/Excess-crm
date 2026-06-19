import type { VoicePersona } from '@excess/db';
import { prisma, withSystemContext, SYSTEM_USER_ID } from '@excess/db';
import { queues } from '../queues.js';

// Retry cadences per build spec §10.6
// RESHMA_VERIFY:  max 5 calls — Day1: +2h, +6h; Day2: 10am/4pm IST; Day3: 11am IST
// KARTHIK_SALES:  max 2 calls — 1 initial + retry at +4h
// RESHMA_FOLLOWUP: max 3 calls — 1 initial + 2 retries with 24h gaps

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

function nextIstTimeMs(hour: number, min: number, daysAhead: number): number {
  const nowMs = Date.now();
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const nowIst = new Date(nowMs + istOffsetMs);

  const utcHour = hour - 5 + (min < 30 ? -1 : 0);
  const utcMin = min < 30 ? 60 + min - 30 : min - 30;

  const target = new Date(Date.UTC(
    nowIst.getUTCFullYear(),
    nowIst.getUTCMonth(),
    nowIst.getUTCDate() + daysAhead,
    utcHour,
    utcMin,
    0, 0,
  ));

  return Math.max(target.getTime() - nowMs, 60_000);
}

const CADENCE: Record<string, { maxCalls: number; getDelays: () => number[] }> = {
  // Unified agent — handles all stages; cadence covers new lead verification retries
  EXCESS_AGENT: {
    maxCalls: 5,
    getDelays: () => [
      2 * ONE_HOUR,
      6 * ONE_HOUR,
      nextIstTimeMs(10, 0, 1),
      nextIstTimeMs(16, 0, 1),
      nextIstTimeMs(11, 0, 2),
    ],
  },
  // Legacy personas
  RESHMA_VERIFY: {
    maxCalls: 5,
    getDelays: () => [
      2 * ONE_HOUR,
      6 * ONE_HOUR,
      nextIstTimeMs(10, 0, 1),
      nextIstTimeMs(16, 0, 1),
      nextIstTimeMs(11, 0, 2),
    ],
  },
  KARTHIK_SALES: {
    maxCalls: 2,
    getDelays: () => [4 * ONE_HOUR],
  },
  RESHMA_FOLLOWUP: {
    maxCalls: 3,
    getDelays: () => [ONE_DAY, 2 * ONE_DAY],
  },
};

export async function scheduleRetryDial(
  leadId: string,
  tenantId: string,
  persona: string,
): Promise<void> {
  const cadence = CADENCE[persona] ?? CADENCE['RESHMA_VERIFY']!;

  const callCount = await withSystemContext(prisma, tenantId, (tx) =>
    tx.call.count({ where: { leadId, tenantId, persona: persona as VoicePersona } }),
  );

  if (callCount >= cadence.maxCalls) {
    await withSystemContext(prisma, tenantId, async (tx) => {
      await tx.lead.update({
        where: { id: leadId },
        data: { stage: 'NOT_ANSWERED', stageChangedAt: new Date() },
      });
      await tx.leadActivity.create({
        data: {
          leadId,
          tenantId,
          actorUserId: SYSTEM_USER_ID,
          actorIsAi: true,
          type: 'STAGE_CHANGE',
          payload: { newStage: 'NOT_ANSWERED', reason: 'max_retries_exhausted', persona } as object,
        },
      });
    });
    return;
  }

  const delays = cadence.getDelays();
  const retryIndex = callCount - 1;
  const delay = delays[retryIndex] ?? delays.at(-1) ?? 2 * ONE_HOUR;

  await queues.voiceDial.add(
    'voice-dial',
    { leadId, tenantId, personaId: persona },
    { delay, priority: 2 },
  );
}
