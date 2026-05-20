import pino from 'pino';
import { prisma, withSystemContext } from '@excess/db';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

/**
 * Deterministic conversation analysis — v1 keyword/lexicon model (no LLM).
 * Lexicons cover English + common Tamil/Tanglish terms; extend as the
 * Tamil Nadu customer base surfaces more phrasing.
 */
const OBJECTION_PATTERNS: { tag: string; keywords: string[] }[] = [
  { tag: 'PRICE', keywords: ['too expensive', 'expensive', 'costly', 'price is high', 'high price', 'budget', 'cannot afford', "can't afford", 'adhigam', 'rate adhigam', 'vela adhigam'] },
  { tag: 'TIMING', keywords: ['not now', 'later', 'call back', 'next month', 'busy', 'appuram', 'aprom', 'ippo illa', 'rendu maasam'] },
  { tag: 'NEEDS_TO_THINK', keywords: ['need to think', 'think about', 'will discuss', 'not sure', 'yosichu', 'yosikkanum', 'parkalam'] },
  { tag: 'DECISION_MAKER', keywords: ['ask my husband', 'ask my wife', 'family decision', 'owner will decide', 'veetla kekkanum', 'kekanum'] },
  { tag: 'NOT_INTERESTED', keywords: ['not interested', 'do not want', "don't want", 'no need', 'vendaam', 'venaam', 'interest illa'] },
  { tag: 'COMPETITOR', keywords: ['another company', 'other quote', 'someone else', 'vere company', 'compare'] },
  { tag: 'TECHNICAL_DOUBT', keywords: ['shadow', 'shading', 'roof space', 'will it work', 'maintenance', 'subsidy doubt'] },
];

const POSITIVE_WORDS = ['interested', 'good', 'great', 'sure', 'okay', 'confirm', 'book', 'definitely', 'happy', 'proceed', 'nalla', 'seri', 'sari', 'venum'];
const NEGATIVE_WORDS = ['expensive', 'problem', 'angry', 'cancel', 'complaint', 'disappointed', 'refuse', 'vendaam', 'kashtam', 'mosam'];

function extractText(transcript: unknown, llmAnalysis: unknown): string {
  const parts: string[] = [];
  const pull = (v: unknown): void => {
    if (typeof v === 'string') {
      parts.push(v);
    } else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string') parts.push(item);
        else if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>;
          for (const k of ['text', 'message', 'content', 'utterance']) {
            if (typeof o[k] === 'string') parts.push(o[k] as string);
          }
        }
      }
    } else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      for (const k of ['summary', 'text', 'transcript', 'outcome']) {
        if (typeof o[k] === 'string') parts.push(o[k] as string);
      }
      if (Array.isArray(o['keyPoints'])) {
        for (const kp of o['keyPoints']) if (typeof kp === 'string') parts.push(kp);
      }
    }
  };
  pull(transcript);
  pull(llmAnalysis);
  return parts.join(' ').toLowerCase();
}

export function analyzeText(text: string): { sentiment: string; objectionTags: string[] } {
  const objectionTags: string[] = [];
  for (const { tag, keywords } of OBJECTION_PATTERNS) {
    if (keywords.some((kw) => text.includes(kw))) objectionTags.push(tag);
  }

  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE_WORDS) if (text.includes(w)) pos++;
  for (const w of NEGATIVE_WORDS) if (text.includes(w)) neg++;
  const sentiment = pos > neg ? 'POSITIVE' : neg > pos ? 'NEGATIVE' : 'NEUTRAL';

  return { sentiment, objectionTags };
}

export async function runConversationIntel(): Promise<void> {
  const calls = await prisma.call.findMany({
    where: { status: 'COMPLETED', intelAnalyzedAt: null },
    select: { id: true, tenantId: true, transcript: true, llmAnalysis: true },
    take: 500,
  });
  if (calls.length === 0) return;

  let analyzed = 0;
  for (const call of calls) {
    const text = extractText(call.transcript, call.llmAnalysis);
    if (!text.trim()) {
      // Nothing to analyse — still stamp so we don't re-scan every run
      await withSystemContext(prisma, call.tenantId, (tx) =>
        tx.call.update({ where: { id: call.id }, data: { intelAnalyzedAt: new Date() } }),
      );
      continue;
    }
    const { sentiment, objectionTags } = analyzeText(text);
    await withSystemContext(prisma, call.tenantId, (tx) =>
      tx.call.update({
        where: { id: call.id },
        data: { sentiment, objectionTags, intelAnalyzedAt: new Date() },
      }),
    );
    analyzed++;
  }

  log.info({ scanned: calls.length, analyzed }, 'conversation_intel.complete');
}

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

export function startConversationIntelScheduler(): void {
  const run = () => {
    void runConversationIntel().catch((err: unknown) =>
      log.error({ err }, 'conversation_intel.run_error'),
    );
  };

  setTimeout(run, 2 * 60 * 1000); // 2-min startup offset
  setInterval(run, CHECK_INTERVAL_MS);

  log.info({ intervalMs: CHECK_INTERVAL_MS }, 'conversation_intel_scheduler.started');
}
