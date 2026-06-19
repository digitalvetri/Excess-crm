import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@excess/db';
import type { LeadSourceType, LeadStage } from '@excess/db';
import { can } from '@excess/shared';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@excess/config';

let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

const reEngagementSchema = z.object({
  daysInactive: z.number().int().min(1).max(90).default(7),
  messageTemplate: z.string().default('solar_reengagement'),
  scheduleAt: z.string().datetime().optional(),
});

const generateMessageSchema = z.object({
  goal: z.enum(['re_engage', 'subsidy_info', 'followup_nudge', 'amc_renewal', 'referral_ask', 'festival_offer']),
  audienceDescription: z.string().max(200).optional(),
  language: z.enum(['tamil', 'english', 'mixed']).default('mixed'),
});

const MAX_RECIPIENTS = 5000;
const PER_SECOND = Math.max(1, Number(process.env['BROADCAST_PER_SECOND'] ?? 10));

const audienceFilterSchema = z.object({
  stage: z.enum(['NEW', 'QUALIFIED', 'FOLLOW_UP', 'CONVERTED', 'NOT_ANSWERED', 'INVALID', 'WRONG_ENQUIRY']).optional(),
  sourceType: z.enum(['META', 'INDIAMART', 'JUSTDIAL', 'WEBSITE', 'WHATSAPP', 'MANUAL', 'PHONE_INBOUND']).optional(),
  city: z.string().max(100).optional(),
  tag: z.string().max(60).optional(),
  // Solar-specific segments
  amcWindow:    z.enum(['expiring30', 'expiring60', 'expired']).optional(),
  subsidyStatus: z.enum(['NOT_APPLIED', 'APPLIED', 'DISCOM_INSPECTION_SCHEDULED', 'DISCOM_APPROVED', 'PORTAL_UPLOAD_DONE', 'CREDITED']).optional(),
  projectStage:  z.enum(['SURVEY', 'DESIGN', 'MATERIAL_ORDERED', 'INSTALLATION', 'COMMISSIONING', 'HANDED_OVER']).optional(),
});

const createBroadcastSchema = z.object({
  name: z.string().min(1).max(160),
  templateName: z.string().max(120).optional(),
  templateParams: z.record(z.string()).optional(),
  bodyText: z.string().max(2000).optional(),
  audienceFilter: audienceFilterSchema.default({}),
  scheduledAt: z.string().datetime().optional(),
});

type AudienceFilter = z.infer<typeof audienceFilterSchema>;

function buildLeadWhere(tenantId: string, filter: AudienceFilter) {
  const now   = new Date();
  const in30  = new Date(now.getTime() + 30 * 86400000);
  const in60  = new Date(now.getTime() + 60 * 86400000);

  type ProjectWhere = { amcExpiresAt?: { gte?: Date; lte?: Date; lt?: Date }; subsidyStatus?: string; stage?: string };
  const projectFilter: ProjectWhere = {};
  if (filter.amcWindow === 'expiring30') projectFilter.amcExpiresAt = { gte: now, lte: in30 };
  else if (filter.amcWindow === 'expiring60') projectFilter.amcExpiresAt = { gte: now, lte: in60 };
  else if (filter.amcWindow === 'expired') projectFilter.amcExpiresAt = { lt: now };
  if (filter.subsidyStatus) projectFilter.subsidyStatus = filter.subsidyStatus;
  if (filter.projectStage)  projectFilter.stage         = filter.projectStage;

  return {
    tenantId,
    isDuplicate: false,
    commsOptedOutAt: null,
    ...(filter.stage && { stage: filter.stage as LeadStage }),
    ...(filter.sourceType && { sourceType: filter.sourceType as LeadSourceType }),
    ...(filter.city && { city: { contains: filter.city, mode: 'insensitive' as const } }),
    ...(filter.tag && { tags: { has: filter.tag } }),
    ...(Object.keys(projectFilter).length > 0 && { projects: { some: projectFilter } }),
  };
}

export const broadcastsRoutes: FastifyPluginAsync = async (app) => {
  // GET /broadcasts — list
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const broadcasts = await req.withTenant((tx) =>
      tx.broadcast.findMany({
        where: { tenantId: req.auth.tenantId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          name: true,
          channel: true,
          templateName: true,
          status: true,
          recipientCount: true,
          sentCount: true,
          failedCount: true,
          scheduledAt: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
        },
      }),
    );

    return reply.send({ data: broadcasts });
  });

  // GET /broadcasts/analytics — campaign performance summary
  app.get('/analytics', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const [totalSent, totalFailed, campaigns, byStatus] = await req.withTenant(async (tx) => [
      await tx.broadcastRecipient.count({ where: { status: 'SENT' } }),
      await tx.broadcastRecipient.count({ where: { status: 'FAILED' } }),
      await tx.broadcast.findMany({
        where:   { status: { in: ['SENT', 'SENDING', 'FAILED'] } },
        orderBy: { createdAt: 'desc' },
        take:    30,
        select:  {
          id: true, name: true, status: true,
          recipientCount: true, sentCount: true, failedCount: true,
          scheduledAt: true, startedAt: true, completedAt: true, createdAt: true,
        },
      }),
      await tx.broadcast.groupBy({ by: ['status'], _count: true }),
    ]);

    // Conversion attribution: recipients who moved to CONVERTED after this broadcast started
    const campaignsWithConversions = await req.withTenant(async (tx) =>
      Promise.all(
        campaigns.map(async (c) => {
          if (!c.startedAt) return { ...c, conversions: 0 };
          const recipientIds = await tx.broadcastRecipient.findMany({
            where:  { broadcastId: c.id, status: 'SENT' },
            select: { leadId: true },
          });
          if (recipientIds.length === 0) return { ...c, conversions: 0 };
          const conversions = await tx.lead.count({
            where: {
              id:            { in: recipientIds.map((r) => r.leadId) },
              stage:         'CONVERTED',
              stageChangedAt: { gte: c.startedAt },
            },
          });
          return { ...c, conversions };
        }),
      ),
    );

    const statMap: Record<string, number> = {};
    for (const s of byStatus) statMap[s.status] = s._count;

    const deliveryRate = totalSent + totalFailed > 0
      ? Math.round((totalSent / (totalSent + totalFailed)) * 100)
      : 0;

    return reply.send({ data: { totalSent, totalFailed, deliveryRate, campaigns: campaignsWithConversions, byStatus: statMap } });
  });

  // GET /broadcasts/templates — static solar template library
  app.get('/templates', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const templates = [
      {
        id: 'amc_renewal_reminder',
        name: 'AMC Renewal Reminder',
        description: 'Remind customers their Annual Maintenance Contract is expiring soon.',
        templateName: 'amc_renewal_reminder',
        defaultAudienceFilter: { amcWindow: 'expiring30' },
        previewText: 'Hi {{name}}, your AMC for project {{project_number}} expires in {{days}} days. Renew now for uninterrupted service.',
      },
      {
        id: 'subsidy_followup',
        name: 'Subsidy Follow-up',
        description: 'Follow up with customers on pending subsidy applications.',
        templateName: 'subsidy_followup',
        defaultAudienceFilter: { subsidyStatus: 'APPLIED' },
        previewText: "Hi {{name}}, your solar subsidy application is under review. We'll keep you posted!",
      },
      {
        id: 'installation_complete',
        name: 'Installation Complete',
        description: 'Congratulate customers on successful installation.',
        templateName: 'installation_complete',
        defaultAudienceFilter: { projectStage: 'HANDED_OVER' },
        previewText: 'Congratulations {{name}}! Your solar system is live. Download the monitoring app to track your savings.',
      },
      {
        id: 'system_health_check',
        name: 'System Health Check',
        description: 'Prompt customers to schedule an annual health check.',
        templateName: 'system_health_check',
        defaultAudienceFilter: { amcWindow: 'expiring60' },
        previewText: "Hi {{name}}, it's time for your annual solar system health check. Book a free inspection today.",
      },
      {
        id: 'referral_invite',
        name: 'Referral Invite',
        description: 'Ask happy customers to refer friends and earn rewards.',
        templateName: 'referral_invite',
        defaultAudienceFilter: { projectStage: 'HANDED_OVER' },
        previewText: 'Hi {{name}}, love your solar system? Refer a friend and earn Rs 2,000 when they install!',
      },
      {
        id: 'nps_survey',
        name: 'NPS Survey',
        description: 'Collect Net Promoter Score from recently installed customers.',
        templateName: 'nps_survey',
        defaultAudienceFilter: { projectStage: 'COMMISSIONING' },
        previewText: 'Hi {{name}}, how likely are you to recommend Excess Solar to friends? Reply with a score 0-10.',
      },
    ];

    return reply.send({ data: templates });
  });

  // GET /broadcasts/:id — detail
  app.get('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const broadcast = await req.withTenant((tx) =>
      tx.broadcast.findUnique({ where: { id } }),
    );
    if (!broadcast) {
      return reply.code(404).send({ error: { code: 'broadcast.not_found', message: 'Broadcast not found' } });
    }
    return reply.send({ data: broadcast });
  });

  // POST /broadcasts/preview — audience size for a filter
  app.post('/preview', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = audienceFilterSchema.safeParse((req.body as { audienceFilter?: unknown })?.audienceFilter ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid filter' } });
    }

    const where = buildLeadWhere(req.auth.tenantId, parsed.data);
    const { count, sample } = await req.withTenant(async (tx) => ({
      count: await tx.lead.count({ where }),
      sample: await tx.lead.findMany({ where, take: 5, select: { name: true, city: true }, orderBy: { createdAt: 'desc' } }),
    }));

    return reply.send({ data: { count: Math.min(count, MAX_RECIPIENTS), totalMatched: count, sample } });
  });

  // POST /broadcasts — create draft
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createBroadcastSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { name, templateName, templateParams, bodyText, audienceFilter, scheduledAt } = parsed.data;
    if (!templateName && !bodyText) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Provide a template name or message text' },
      });
    }

    const broadcast = await req.withTenant((tx) =>
      tx.broadcast.create({
        data: {
          tenantId: req.auth.tenantId,
          name,
          channel: 'WHATSAPP',
          createdByUserId: req.auth.userId,
          audienceFilter: audienceFilter as Prisma.InputJsonValue,
          ...(templateName && { templateName }),
          ...(templateParams && { templateParams: templateParams as Prisma.InputJsonValue }),
          ...(bodyText && { bodyText }),
          ...(scheduledAt && { scheduledAt: new Date(scheduledAt), status: 'SCHEDULED' }),
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, broadcastId: broadcast.id }, 'broadcast.created');
    return reply.code(201).send({ data: broadcast });
  });

  // POST /broadcasts/:id/start — materialise recipients and enqueue sends
  app.post('/:id/start', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const broadcast = await req.withTenant((tx) => tx.broadcast.findUnique({ where: { id } }));
    if (!broadcast) {
      return reply.code(404).send({ error: { code: 'broadcast.not_found', message: 'Broadcast not found' } });
    }
    if (broadcast.status !== 'DRAFT' && broadcast.status !== 'SCHEDULED') {
      return reply.code(409).send({
        error: { code: 'broadcast.not_startable', message: 'Broadcast has already been started' },
      });
    }

    const filterParsed = audienceFilterSchema.safeParse(broadcast.audienceFilter ?? {});
    const where = buildLeadWhere(req.auth.tenantId, filterParsed.success ? filterParsed.data : {});

    const leads = await req.withTenant((tx) =>
      tx.lead.findMany({ where, take: MAX_RECIPIENTS, select: { id: true, phone: true } }),
    );

    if (leads.length === 0) {
      return reply.code(422).send({
        error: { code: 'broadcast.empty_audience', message: 'No leads match this audience' },
      });
    }

    const recipients = await req.withTenant(async (tx) => {
      await tx.broadcastRecipient.createMany({
        data: leads.map((l) => ({
          broadcastId: id,
          tenantId: req.auth.tenantId,
          leadId: l.id,
          phone: l.phone,
        })),
      });
      await tx.broadcast.update({
        where: { id },
        data: { status: 'SENDING', startedAt: new Date(), recipientCount: leads.length },
      });
      return tx.broadcastRecipient.findMany({
        where: { broadcastId: id },
        select: { id: true, leadId: true, phone: true },
      });
    });

    const templateParams = (broadcast.templateParams ?? {}) as Record<string, string>;
    await app.queues.broadcastSend.addBulk(
      recipients.map((r, idx) => ({
        name: 'broadcast-send',
        data: {
          broadcastId: id,
          recipientId: r.id,
          tenantId: req.auth.tenantId,
          leadId: r.leadId,
          phone: r.phone,
          channel: broadcast.channel,
          templateName: broadcast.templateName,
          templateParams,
          bodyText: broadcast.bodyText,
        },
        opts: { attempts: 1, delay: Math.floor(idx / PER_SECOND) * 1000 },
      })),
    );

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId, broadcastId: id, recipients: recipients.length },
      'broadcast.started',
    );
    return reply.send({ data: { id, status: 'SENDING', recipientCount: recipients.length } });
  });

  // DELETE /broadcasts/:id — delete a draft
  app.delete('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const broadcast = await req.withTenant((tx) =>
      tx.broadcast.findUnique({ where: { id }, select: { status: true } }),
    );
    if (!broadcast) {
      return reply.code(404).send({ error: { code: 'broadcast.not_found', message: 'Broadcast not found' } });
    }
    if (broadcast.status !== 'DRAFT') {
      return reply.code(409).send({
        error: { code: 'broadcast.not_deletable', message: 'Only draft broadcasts can be deleted' },
      });
    }

    await req.withTenant((tx) => tx.broadcast.delete({ where: { id } }));
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, broadcastId: id }, 'broadcast.deleted');
    return reply.code(204).send();
  });

  // GET /broadcasts/audience-presets — pre-built smart segments
  app.get('/audience-presets', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const sevenDaysAgo  = new Date(Date.now() - 7  * 86400000);
    const in30          = new Date(Date.now() + 30 * 86400000);

    const [coldLeads, hotLeads, notAnswered7d, followUp, amcExpiring] = await req.withTenant((tx) =>
      Promise.all([
        tx.lead.count({ where: { stage: 'NOT_ANSWERED', stageChangedAt: { lte: thirtyDaysAgo } } }),
        tx.lead.count({ where: { stage: 'QUALIFIED' } }),
        tx.lead.count({ where: { stage: 'NOT_ANSWERED', stageChangedAt: { gte: sevenDaysAgo } } }),
        tx.lead.count({ where: { stage: 'FOLLOW_UP' } }),
        tx.amcContract.count({ where: { status: 'ACTIVE', endDate: { lte: in30, gte: new Date() } } }),
      ]),
    );

    const presets = [
      {
        id: 'cold-leads',
        name: 'Re-engage Cold Leads',
        description: 'Leads that stopped responding > 30 days ago',
        icon: '🧊',
        audienceSize: coldLeads,
        filter: { stage: 'NOT_ANSWERED' },
        suggestedTemplate: 'solar_reengagement',
        daysInactive: 30,
      },
      {
        id: 'hot-qualified',
        name: 'Push Qualified Leads',
        description: 'Leads qualified but not yet converted',
        icon: '🔥',
        audienceSize: hotLeads,
        filter: { stage: 'QUALIFIED' },
        suggestedTemplate: 'solar_subsidy_reminder',
        daysInactive: 0,
      },
      {
        id: 'not-answered-recent',
        name: 'Recent No-Answers',
        description: "Leads that didn't answer in the last 7 days",
        icon: '📵',
        audienceSize: notAnswered7d,
        filter: { stage: 'NOT_ANSWERED' },
        suggestedTemplate: 'solar_callback_request',
        daysInactive: 7,
      },
      {
        id: 'follow-up',
        name: 'Follow-Up Pipeline',
        description: 'Leads scheduled for follow-up',
        icon: '📅',
        audienceSize: followUp,
        filter: { stage: 'FOLLOW_UP' },
        suggestedTemplate: 'solar_followup_nudge',
        daysInactive: 0,
      },
      {
        id: 'amc-expiring',
        name: 'AMC Renewal Campaign',
        description: 'Customers with AMC expiring in 30 days',
        icon: '🛡️',
        audienceSize: amcExpiring,
        filter: { amcWindow: 'expiring30' },
        suggestedTemplate: 'amc_renewal_reminder',
        daysInactive: 0,
      },
    ];

    return reply.send({ data: { presets } });
  });

  // POST /broadcasts/re-engagement — quick-launch re-engagement draft
  app.post('/re-engagement', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = reEngagementSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }
    const { daysInactive, messageTemplate, scheduleAt } = parsed.data;

    const cutoff = new Date(Date.now() - daysInactive * 86400000);
    const audienceSize = await req.withTenant((tx) =>
      tx.lead.count({ where: { stage: 'NOT_ANSWERED', stageChangedAt: { lte: cutoff } } }),
    );

    const broadcast = await req.withTenant((tx) =>
      tx.broadcast.create({
        data: {
          tenantId: req.auth.tenantId,
          createdByUserId: req.auth.userId,
          name: `Re-engagement Campaign – ${new Date().toLocaleDateString('en-IN')}`,
          channel: 'WHATSAPP',
          status: scheduleAt ? 'SCHEDULED' : 'DRAFT',
          templateName: messageTemplate,
          audienceFilter: { stage: 'NOT_ANSWERED', daysInactive } as Prisma.InputJsonValue,
          scheduledAt: scheduleAt ? new Date(scheduleAt) : null,
          templateParams: {} as Prisma.InputJsonValue,
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, broadcastId: broadcast.id }, 'broadcast.re_engagement_created');
    return reply.code(201).send({ data: { broadcast, audienceSize } });
  });

  // POST /broadcasts/generate-message — AI-powered message generation
  app.post('/generate-message', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = generateMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }
    const { goal, audienceDescription, language } = parsed.data;

    const goalContext: Record<string, string> = {
      re_engage:      'Re-engage a cold solar lead who stopped responding',
      subsidy_info:   'Inform about PM Surya Ghar subsidy up to ₹78,000',
      followup_nudge: 'Nudge a warm lead to take the next step',
      amc_renewal:    'Remind customer their annual maintenance contract is expiring',
      referral_ask:   'Ask a happy customer to refer friends and earn ₹5,000',
      festival_offer: 'Announce a festival special offer on solar installation',
    };

    const fallbacks: Record<string, string> = {
      re_engage:      'Vanakkam! Ungal solar enquiry-oda follow up pannuren. Free estimate kedaikum - call pannal mattum. ☀️',
      subsidy_info:   'Government subsidy up to ₹78,000 for solar! Last chance to apply this year. Call us for details.',
      followup_nudge: 'Hi! Your solar proposal is ready. Install now and start saving ₹3,000/month. Shall we schedule a visit?',
      amc_renewal:    'Your solar AMC is expiring soon. Renew now to keep your system running at peak efficiency. Call us today!',
      referral_ask:   'Enjoying solar savings? Refer a friend and earn ₹5,000! Share your referral link now.',
      festival_offer: 'Festival special: ₹10,000 off on solar installation this month only! Book your free survey today.',
    };

    const client = getAnthropic();
    if (!client) {
      return reply.send({ data: { message: fallbacks[goal] ?? 'Contact us for solar savings!', generated: false } });
    }

    try {
      const prompt = `You are a WhatsApp message writer for Excess Renew Solar, a solar energy company in Tamil Nadu, India.
Write a WhatsApp message for the following goal: ${goalContext[goal] ?? goal}
${audienceDescription ? `Audience: ${audienceDescription}` : ''}
Language preference: ${language === 'tamil' ? 'Tamil using Tamil script' : language === 'mixed' ? 'Tanglish (Tamil words written in English) mixed with English' : 'English'}
Requirements:
- Maximum 160 characters
- Conversational and warm tone
- Include a clear call to action
- For Indian solar context (Tamil Nadu)
- Do NOT use emojis excessively (max 2)
Output ONLY the message text, no explanation.`;

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });

      const block = response.content[0];
      const message = block && block.type === 'text' ? block.text.trim() : (fallbacks[goal] ?? 'Contact us for solar savings!');
      return reply.send({ data: { message, generated: true } });
    } catch {
      return reply.send({ data: { message: fallbacks[goal] ?? 'Contact us for solar savings!', generated: false } });
    }
  });

  // POST /broadcasts/:id/enroll-sequence — enrol SENT recipients into a follow-up sequence
  app.post('/:id/enroll-sequence', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const body = z.object({ sequenceId: z.string().uuid() }).safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'sequenceId is required' } });
    }

    const broadcast = await req.withTenant((tx) =>
      tx.broadcast.findUnique({ where: { id }, select: { status: true, startedAt: true } }),
    );
    if (!broadcast) {
      return reply.code(404).send({ error: { code: 'broadcast.not_found', message: 'Broadcast not found' } });
    }
    if (broadcast.status !== 'SENT') {
      return reply.code(409).send({ error: { code: 'broadcast.not_sent', message: 'Broadcast must be fully SENT to enrol in a sequence' } });
    }

    const sequence = await req.withTenant((tx) =>
      tx.sequence.findUnique({
        where:  { id: body.data.sequenceId },
        select: { id: true, steps: { orderBy: { stepOrder: 'asc' }, take: 1, select: { delayHours: true } } },
      }),
    );
    if (!sequence) {
      return reply.code(404).send({ error: { code: 'sequence.not_found', message: 'Sequence not found' } });
    }
    const firstStep = sequence.steps[0];
    if (!firstStep) {
      return reply.code(422).send({ error: { code: 'sequence.no_steps', message: 'Sequence has no steps' } });
    }

    const recipients = await req.withTenant((tx) =>
      tx.broadcastRecipient.findMany({
        where:  { broadcastId: id, status: 'SENT' },
        select: { leadId: true },
        take:   MAX_RECIPIENTS,
      }),
    );

    const enrolled = await req.withTenant((tx) =>
      tx.sequenceEnrollment.createMany({
        data: recipients.map((r) => ({
          tenantId:   req.auth.tenantId,
          sequenceId: body.data.sequenceId,
          leadId:     r.leadId,
          currentStep: 0,
          nextRunAt:  new Date(Date.now() + firstStep.delayHours * 3600 * 1000),
        })),
        skipDuplicates: true,
      }),
    );

    req.log.info(
      { tenantId: req.auth.tenantId, broadcastId: id, sequenceId: body.data.sequenceId, count: enrolled.count },
      'broadcast.sequence_enrolled',
    );
    return reply.send({ data: { enrolled: enrolled.count } });
  });
};
