import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { llmComplete } from '../lib/llm.js';
import { AI_SYSTEM_PROMPTS } from '../lib/ai-prompts.js';

interface CallQaScore {
  overall: number;
  grade: string;
  dimensions: Record<string, number>;
  compliance: boolean;
  strengths: string[];
  improvements: string[];
}

// Parse the QA JSON the LLM returns (tolerant of markdown fences / surrounding prose).
function parseQa(raw: string): CallQaScore | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(raw.slice(start, end + 1)) as Partial<CallQaScore>;
    if (typeof obj.overall !== 'number' || typeof obj.dimensions !== 'object' || obj.dimensions === null) return null;
    return {
      overall: Math.max(0, Math.min(100, Math.round(obj.overall))),
      grade: typeof obj.grade === 'string' ? obj.grade : '—',
      dimensions: obj.dimensions as Record<string, number>,
      compliance: obj.compliance !== false,
      strengths: Array.isArray(obj.strengths) ? obj.strengths.slice(0, 2) : [],
      improvements: Array.isArray(obj.improvements) ? obj.improvements.slice(0, 2) : [],
    };
  } catch {
    return null;
  }
}

export const callsRoutes: FastifyPluginAsync = async (app) => {
  // GET /calls/:id/insights — keyword extraction from transcript.
  // Reads (and updates) call transcript/sentiment — company-internal, so calls.read
  // (ADMIN/EMPLOYEE), not the broader leads.read.own that franchise roles also hold.
  app.get('/:id/insights', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!can(req.auth.role, 'calls.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const call = await req.withTenant((tx) =>
      tx.call.findUnique({
        where: { id },
        select: {
          id: true,
          transcript: true,
          llmAnalysis: true,
          durationSec: true,
          status: true,
          sentiment: true,
          objectionTags: true,
        },
      })
    );

    if (!call) {
      return reply.code(404).send({ error: { code: 'call.not_found', message: 'Call not found' } });
    }

    const transcriptText = (call.transcript as { text?: string } | null)?.text ?? '';
    const analysis = call.llmAnalysis as Record<string, unknown> | null;
    const text = transcriptText.toLowerCase();

    const painPoints: string[] = [];
    if (text.includes('bill') || text.includes('electricity cost')) painPoints.push('High electricity bill');
    if (text.includes('subsidy') || text.includes('government')) painPoints.push('Subsidy interest');
    if (text.includes('loan') || text.includes('emi') || text.includes('finance')) painPoints.push('Financing needed');
    if (text.includes('roof') || text.includes('space')) painPoints.push('Roof/space concern');
    if (text.includes('neighbour') || text.includes('neighbor') || text.includes('friend')) painPoints.push('Social proof present');

    const objections: string[] = [];
    if (text.includes('expensive') || text.includes('costly') || text.includes('price')) objections.push('Price concern');
    if (text.includes('think') || text.includes('time') || text.includes('later')) objections.push('Needs time');
    if (text.includes('husband') || text.includes('wife') || text.includes('family') || text.includes('consult')) objections.push('Family decision');
    if (text.includes('competitor') || text.includes('other company') || text.includes('tata') || text.includes('adani')) objections.push('Comparing competitors');

    const outcome = analysis?.['outcome'] as string | undefined;
    const interestLevel = outcome === 'qualified' ? 'High'
      : outcome === 'follow_up' ? 'Medium'
      : outcome === 'not_answered' ? 'Unknown'
      : painPoints.length > 1 ? 'Medium' : 'Low';

    const nextAction = outcome === 'qualified' ? 'Schedule site survey appointment'
      : outcome === 'follow_up' ? 'Follow up call with subsidy details'
      : objections.includes('Price concern') ? 'Send WhatsApp with EMI calculator'
      : objections.includes('Family decision') ? 'Schedule call with decision maker'
      : 'Retry call during business hours';

    // Simple positive/negative sentiment from text signals
    const positiveSignals = ['interested', 'good', 'okay', 'yes', 'sure', 'sari', 'okay-a'];
    const negativeSignals = ['no', 'not interested', 'busy', 'later', 'expensive'];
    const posCt = positiveSignals.filter((s) => text.includes(s)).length;
    const negCt = negativeSignals.filter((s) => text.includes(s)).length;
    const sentiment = call.sentiment ?? (posCt >= negCt ? 'positive' : 'negative');

    // Persist extracted tags back to the call record
    const derivedTags = objections.map((o) =>
      o === 'Price concern' ? 'PRICE'
      : o === 'Needs time' ? 'TIMING'
      : o === 'Family decision' ? 'DECISION_MAKER'
      : o === 'Comparing competitors' ? 'COMPETITOR'
      : 'OTHER'
    );
    if (transcriptText.length > 0 && call.objectionTags.length === 0 && derivedTags.length > 0) {
      await req.withTenant((tx) =>
        tx.call.update({
          where: { id },
          data: { sentiment, objectionTags: derivedTags, intelAnalyzedAt: new Date() },
        })
      );
    }

    // AI summary of the transcript (cached — transcript is immutable once the call
    // ends). Falls back to null when there's no transcript or GROQ_API_KEY is unset,
    // in which case the UI shows the keyword-derived fields above.
    let summary: string | null = (analysis?.['summary'] as string | undefined) ?? null;
    if (!summary && transcriptText.length > 40) {
      const cacheKey = `call_summary:${req.auth.tenantId}:${id}`;
      const cached = await app.redis.get(cacheKey);
      if (cached) {
        summary = cached;
      } else {
        const ai = await llmComplete(
          `Summarise this solar sales call in 2-3 short bullet points: the customer's interest level, their key concern/objection, and the single best next step.\n\nTranscript:\n${transcriptText.slice(0, 4000)}`,
          {
            system: AI_SYSTEM_PROMPTS.callSummary,
            maxTokens: 200,
          },
        );
        if (ai) {
          summary = ai.trim();
          await app.redis.setex(cacheKey, 86400, summary);
        }
      }
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, callId: id }, 'call.insights_extracted');

    return reply.send({
      data: {
        callId: id,
        durationSec: call.durationSec,
        summary,
        interestLevel,
        painPoints,
        objections,
        nextAction,
        sentiment,
        transcriptLength: transcriptText.length,
      },
    });
  });

  // GET /calls/:id/qa — AI QA scorecard for a completed call (rubric-scored from the
  // transcript, cached in llmAnalysis.qa so it's computed once).
  app.get('/:id/qa', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!can(req.auth.role, 'calls.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const call = await req.withTenant((tx) =>
      tx.call.findUnique({ where: { id }, select: { id: true, transcript: true, llmAnalysis: true } }),
    );
    if (!call) {
      return reply.code(404).send({ error: { code: 'call.not_found', message: 'Call not found' } });
    }

    const transcriptText = (call.transcript as { text?: string } | null)?.text ?? '';
    if (transcriptText.length < 40) {
      return reply.send({ data: { qa: null, reason: 'transcript_too_short' } });
    }

    const analysis = (call.llmAnalysis as Record<string, unknown> | null) ?? {};
    if (analysis['qa']) {
      return reply.send({ data: { qa: analysis['qa'], cached: true } });
    }

    const ai = await llmComplete(`Transcript:\n${transcriptText.slice(0, 5000)}`, {
      system: AI_SYSTEM_PROMPTS.callQa,
      maxTokens: 500,
      temperature: 0.2,
    });
    if (ai == null) {
      return reply.code(503).send({ error: { code: 'calls.ai_unavailable', message: 'QA scoring needs GROQ_API_KEY.' } });
    }

    const qa = parseQa(ai);
    if (!qa) {
      return reply.code(502).send({ error: { code: 'calls.qa_parse_failed', message: 'Could not score this call.' } });
    }

    await req.withTenant((tx) =>
      tx.call.update({ where: { id }, data: { llmAnalysis: { ...analysis, qa } as object } }),
    );
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, callId: id, overall: qa.overall }, 'call.qa_scored');
    return reply.send({ data: { qa } });
  });
};
