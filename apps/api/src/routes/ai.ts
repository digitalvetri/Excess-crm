import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { llmComplete } from '../lib/llm.js';
import { AI_SYSTEM_PROMPTS } from '../lib/ai-prompts.js';

export const aiRoutes: FastifyPluginAsync = async (app) => {
  // GET /ai/daily-brief — an AI-phrased "your day" briefing for the current user.
  // RLS-scoped (each role sees their own pipeline). Cached per user per day. Always
  // returns something useful — a deterministic brief when GROQ_API_KEY is unset.
  app.get('/daily-brief', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.own')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `ai_daily_brief:${req.auth.tenantId}:${req.auth.userId}:${today}`;
    const cached = await app.redis.get(cacheKey);
    if (cached) return reply.send({ data: JSON.parse(cached) as unknown });

    const overdueCutoff = new Date(Date.now() - 48 * 3600 * 1000);
    const { hot, overdue, qualified, followUp, newToday } = await req.withTenant(async (tx) => {
      const [hotLeads, overdueCount, qualifiedCount, followUpCount, newTodayCount] = await Promise.all([
        tx.lead.findMany({
          where: { stage: { in: ['NEW', 'QUALIFIED', 'FOLLOW_UP'] }, aiScore: { gte: 70 } },
          orderBy: { aiScore: 'desc' },
          take: 5,
          select: { id: true, name: true, stage: true, aiScore: true, city: true },
        }),
        tx.lead.count({ where: { stage: { in: ['NEW', 'QUALIFIED', 'FOLLOW_UP'] }, stageChangedAt: { lt: overdueCutoff } } }),
        tx.lead.count({ where: { stage: 'QUALIFIED' } }),
        tx.lead.count({ where: { stage: 'FOLLOW_UP' } }),
        tx.lead.count({ where: { stage: 'NEW', receivedAt: { gte: new Date(today) } } }),
      ]);
      return {
        hot: hotLeads,
        overdue: overdueCount,
        qualified: qualifiedCount,
        followUp: followUpCount,
        newToday: newTodayCount,
      };
    });

    const stats = { hot: hot.length, overdue, qualified, followUp, newToday };
    const hotList =
      hot.map((l) => `${l.name}${l.city ? ` (${l.city})` : ''} — ${l.stage}, score ${l.aiScore}`).join('; ') || 'none';

    const prompt = `Today's snapshot:
- New leads today: ${newToday}
- Hot leads to contact now: ${hotList}
- Follow-ups overdue (>48h in stage): ${overdue}
- Pipeline: ${qualified} qualified, ${followUp} in follow-up`;
    const briefText = await llmComplete(prompt, { system: AI_SYSTEM_PROMPTS.dailyBrief, maxTokens: 160, temperature: 0.5 });
    const brief =
      briefText?.trim() ??
      `You have ${stats.hot} hot lead${stats.hot === 1 ? '' : 's'} to contact, ${overdue} follow-up${overdue === 1 ? '' : 's'} overdue, and ${qualified + followUp} deal${qualified + followUp === 1 ? '' : 's'} in your pipeline. Start with the hottest lead.`;
    const result = { brief, stats, hotLeads: hot, generatedAt: new Date().toISOString() };

    // Cache the AI brief for the working day; keep the deterministic fallback short-lived.
    await app.redis.setex(cacheKey, briefText ? 8 * 3600 : 300, JSON.stringify(result));
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, aiUsed: Boolean(briefText) }, 'ai.daily_brief');
    return reply.send({ data: result });
  });
};
