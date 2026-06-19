import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';

export const callsRoutes: FastifyPluginAsync = async (app) => {
  // GET /calls/:id/insights — keyword extraction from transcript
  app.get('/:id/insights', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!can(req.auth.role, 'leads.read.own')) {
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

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, callId: id }, 'call.insights_extracted');

    return reply.send({
      data: {
        callId: id,
        durationSec: call.durationSec,
        interestLevel,
        painPoints,
        objections,
        nextAction,
        sentiment,
        transcriptLength: transcriptText.length,
      },
    });
  });
};
