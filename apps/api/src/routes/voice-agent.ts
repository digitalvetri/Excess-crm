import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import crypto from 'crypto';
import { RoomServiceClient, AccessToken } from 'livekit-server-sdk';
import { can } from '@excess/shared';
import { z } from 'zod';
import { env } from '@excess/config';
import { prisma, withSystemContext } from '@excess/db';

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  preview_url: string | null;
  labels: Record<string, string>;
  description: string | null;
  samples: Array<{ sample_id: string; file_name: string }> | null;
}

const upsertSettingsSchema = z.object({
  dailyCallCap: z.number().int().min(1).max(10000).optional(),
  businessHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  businessHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().optional(),
  maxRetriesPerLead: z.number().int().min(1).max(10).optional(),
  retryIntervalHours: z.number().int().min(1).max(48).optional(),
  aiDialEnabled: z.boolean().optional(),
});

// ─── Playground helpers ───────────────────────────────────────────────────────

function playgroundDefaultPrompt(
  personaId: string,
  lead: { name: string; phone: string; city: string; stage: string },
): string {
  const name = personaId === 'KARTHIK_SALES' ? 'Karthik' : 'Reshma';
  return `You are ${name}, a friendly solar energy sales assistant at Excess Renew Tech, Coimbatore. You speak Tamil primarily but switch to English when asked. You are helpful, knowledgeable, and professional.

Current lead:
- Name: ${lead.name}
- Phone: ${lead.phone}
- City: ${lead.city}
- Stage: ${lead.stage}

[PLAYGROUND MODE — this is a simulation, no real calls are made. Respond naturally as the ${personaId} persona.]`;
}

function playgroundTools(personaId: string): object[] {
  const tools: object[] = [
    {
      type: 'function',
      function: {
        name: 'getLeadInfo',
        description: 'Get current lead information (name, phone, city, stage, interest)',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'updateLeadStage',
        description: 'Update the lead pipeline stage',
        parameters: {
          type: 'object',
          properties: {
            stage: { type: 'string', enum: ['QUALIFIED', 'NOT_ANSWERED', 'INVALID', 'WRONG_ENQUIRY', 'FOLLOW_UP', 'CONVERTED'] },
            scheduledAt: { type: 'string', description: 'ISO8601 datetime for FOLLOW_UP stage' },
          },
          required: ['stage'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getProductInfo',
        description: 'Get solar product pricing and details by category',
        parameters: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: ['residential', 'commercial', 'industrial', 'offgrid'] },
          },
          required: ['category'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'scheduleFollowUp',
        description: 'Schedule a follow-up call for the lead',
        parameters: {
          type: 'object',
          properties: {
            scheduledAt: { type: 'string', description: 'ISO8601 datetime for the follow-up' },
          },
          required: ['scheduledAt'],
        },
      },
    },
  ];

  if (personaId === 'KARTHIK_SALES') {
    tools.push({
      type: 'function',
      function: {
        name: 'scheduleAppointment',
        description: 'Schedule a site survey appointment with the customer',
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
    });
  }

  if (personaId === 'RESHMA_FOLLOWUP') {
    tools.push(
      {
        type: 'function',
        function: {
          name: 'getFollowUpContext',
          description: 'Get previous call history and activities for context',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      {
        type: 'function',
        function: {
          name: 'rescheduleFollowUp',
          description: 'Reschedule the follow-up to a later time',
          parameters: {
            type: 'object',
            properties: {
              scheduledAt: { type: 'string', description: 'New ISO8601 datetime' },
            },
            required: ['scheduledAt'],
          },
        },
      },
    );
  }

  return tools;
}

function playgroundSimulateTool(
  name: string,
  args: Record<string, unknown>,
  lead: { name: string; phone: string; city: string; stage: string },
): unknown {
  const PRODUCT_CATALOG: Record<string, unknown> = {
    residential: { pricePerKw: 55000, subsidy: 'PM Surya Ghar — up to ₹78,000', roiYears: 4.5, warranty: '25yr panel, 5yr inverter' },
    commercial: { pricePerKw: 48000, subsidy: 'MNRE CAPEX subsidy', roiYears: 3.5, warranty: '25yr panel, 10yr inverter' },
    industrial: { pricePerKw: 42000, subsidy: 'No subsidy — REC mechanism', roiYears: 3.0, warranty: '25yr panel, 10yr inverter' },
    offgrid: { pricePerKw: 75000, subsidy: 'PM KUSUM up to 60%', roiYears: 6.0, warranty: '25yr panel, 5yr battery' },
  };

  switch (name) {
    case 'getLeadInfo':
      return { id: 'sim-001', ...lead, language: 'Tamil', factSheet: { interest: 'residential', monthlyBill: '₹3,000' } };
    case 'updateLeadStage':
      return { success: true, stage: args['stage'], note: '[SIMULATED]' };
    case 'getProductInfo':
      return PRODUCT_CATALOG[args['category'] as string] ?? { error: 'Unknown category' };
    case 'scheduleFollowUp':
      return { success: true, scheduledAt: args['scheduledAt'], note: '[SIMULATED]' };
    case 'scheduleAppointment':
      return { success: true, appointmentId: 'sim-appt-001', scheduledAt: args['scheduledAt'], siteAddress: args['siteAddress'], note: '[SIMULATED]' };
    case 'getFollowUpContext':
      return {
        activities: [{ type: 'STAGE_CHANGE', payload: { newStage: 'FOLLOW_UP' }, createdAt: new Date().toISOString() }],
        previousCalls: [{ persona: 'RESHMA_VERIFY', status: 'COMPLETED', durationSec: 45 }],
      };
    case 'rescheduleFollowUp':
      return { success: true, scheduledAt: args['scheduledAt'], note: '[SIMULATED]' };
    default:
      return { error: `Unknown function: ${name}` };
  }
}

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export const voiceAgentRoutes: FastifyPluginAsync = async (app) => {
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 25 } });
  // GET /voice-agent/settings
  app.get('/settings', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const settings = await req.withTenant((tx) =>
      tx.voiceAgentSettings.findUnique({ where: { tenantId: req.auth.tenantId } }),
    );

    return reply.send({ data: settings });
  });

  // PUT /voice-agent/settings
  app.put('/settings', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.configure')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = upsertSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const {
      dailyCallCap, businessHoursStart, businessHoursEnd,
      timezone, maxRetriesPerLead, retryIntervalHours, aiDialEnabled,
    } = parsed.data;

    const settings = await req.withTenant((tx) =>
      tx.voiceAgentSettings.upsert({
        where: { tenantId: req.auth.tenantId },
        create: {
          tenantId: req.auth.tenantId,
          ...(dailyCallCap !== undefined && { dailyCallCap }),
          ...(businessHoursStart !== undefined && { businessHoursStart }),
          ...(businessHoursEnd !== undefined && { businessHoursEnd }),
          ...(timezone !== undefined && { timezone }),
          ...(maxRetriesPerLead !== undefined && { maxRetriesPerLead }),
          ...(retryIntervalHours !== undefined && { retryIntervalHours }),
          ...(aiDialEnabled !== undefined && { aiDialEnabled }),
        },
        update: {
          ...(dailyCallCap !== undefined && { dailyCallCap }),
          ...(businessHoursStart !== undefined && { businessHoursStart }),
          ...(businessHoursEnd !== undefined && { businessHoursEnd }),
          ...(timezone !== undefined && { timezone }),
          ...(maxRetriesPerLead !== undefined && { maxRetriesPerLead }),
          ...(retryIntervalHours !== undefined && { retryIntervalHours }),
          ...(aiDialEnabled !== undefined && { aiDialEnabled }),
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId }, 'voice_agent.settings_updated');
    return reply.send({ data: settings });
  });

  // PUT /voice-agent/ab-config — per-persona prompt A/B split percentages
  app.put('/ab-config', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.configure')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = z
      .object({ abTestConfig: z.record(z.number().int().min(0).max(100)) })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid A/B config' } });
    }

    const settings = await req.withTenant((tx) =>
      tx.voiceAgentSettings.upsert({
        where: { tenantId: req.auth.tenantId },
        create: { tenantId: req.auth.tenantId, abTestConfig: parsed.data.abTestConfig },
        update: { abTestConfig: parsed.data.abTestConfig },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId }, 'voice_agent.ab_config_updated');
    return reply.send({ data: settings });
  });

  // GET /voice-agent/ab-results — compare A vs B variant call outcomes
  app.get('/ab-results', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const calls = await req.withTenant((tx) =>
      tx.call.findMany({
        where: { tenantId: req.auth.tenantId, abVariant: { not: null } },
        select: { persona: true, abVariant: true, status: true, durationSec: true, connectedAt: true },
      }),
    );

    type Bucket = {
      persona: string;
      variant: string;
      calls: number;
      connected: number;
      durationSum: number;
      durationCount: number;
    };
    const map = new Map<string, Bucket>();
    for (const c of calls) {
      const variant = c.abVariant ?? 'A';
      const key = `${c.persona}|${variant}`;
      const b = map.get(key) ?? {
        persona: c.persona,
        variant,
        calls: 0,
        connected: 0,
        durationSum: 0,
        durationCount: 0,
      };
      b.calls++;
      if (c.connectedAt || c.status === 'COMPLETED') b.connected++;
      if (c.durationSec != null) {
        b.durationSum += c.durationSec;
        b.durationCount++;
      }
      map.set(key, b);
    }

    const results = [...map.values()]
      .map((b) => ({
        persona: b.persona,
        variant: b.variant,
        calls: b.calls,
        connectRate: b.calls > 0 ? Math.round((b.connected / b.calls) * 100) : 0,
        avgDurationSec: b.durationCount > 0 ? Math.round(b.durationSum / b.durationCount) : 0,
      }))
      .sort((a, b) => a.persona.localeCompare(b.persona) || a.variant.localeCompare(b.variant));

    return reply.send({ data: results });
  });

  // GET /voice-agent/configs — list persona configs for tenant
  app.get('/configs', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const configs = await req.withTenant((tx) =>
      tx.voiceAgentConfig.findMany({
        where: { tenantId: req.auth.tenantId },
        orderBy: [{ personaId: 'asc' }, { version: 'desc' }],
        select: {
          id: true,
          personaId: true,
          systemPrompt: true,
          version: true,
          isActive: true,
          activatedAt: true,
          createdAt: true,
          voiceConfig: true,
        },
      }),
    );

    return reply.send({ data: configs });
  });

  // GET /voice-agent/calls — recent calls
  app.get('/calls', async (req, reply) => {
    if (!can(req.auth.role, 'calls.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const q = req.query as { cursor?: string; limit?: string; persona?: string; status?: string };
    const limit = Math.min(parseInt(q.limit ?? '50'), 200);

    const calls = await req.withTenant((tx) =>
      tx.call.findMany({
        where: {
          tenantId: req.auth.tenantId,
          ...(q.persona && { persona: q.persona as never }),
          ...(q.status && { status: q.status as never }),
          ...(q.cursor && { id: { lt: q.cursor } }),
        },
        take: limit + 1,
        orderBy: { initiatedAt: 'desc' },
        select: {
          id: true,
          leadId: true,
          persona: true,
          direction: true,
          status: true,
          durationSec: true,
          initiatedAt: true,
          connectedAt: true,
          endedAt: true,
          endReason: true,
          lead: { select: { name: true, phone: true, stage: true } },
        },
      }),
    );

    const hasMore = calls.length > limit;
    if (hasMore) calls.pop();

    return reply.send({
      data: {
        calls,
        nextCursor: hasMore ? (calls[calls.length - 1]?.id ?? null) : null,
        hasMore,
      },
    });
  });

  // POST /voice-agent/configs — save a new prompt version for a persona
  app.post('/configs', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.configure')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const voiceConfigSchema = z.object({
      firstMessage: z.string().max(2000).optional(),
      language: z.string().optional(),
      sttProvider: z.string().optional(),
      llmProvider: z.string().optional(),
      ttsProvider: z.string().optional(),
      voiceId: z.string().optional(),
      responseTiming: z.enum(['low_latency', 'balanced', 'conservative']).optional(),
      voiceSpeed: z.number().min(0.5).max(2.0).optional(),
      allowInterruptions: z.boolean().optional(),
      maxDurationSec: z.number().int().min(30).max(1800).optional(),
      idleTimeoutSec: z.number().int().min(5).max(120).optional(),
      idleTurns: z.number().int().min(1).max(20).optional(),
      callTransfer: z.object({ enabled: z.boolean(), number: z.string() }).optional(),
    });

    const parsed = z
      .object({
        personaId: z.enum(['RESHMA_VERIFY', 'KARTHIK_SALES', 'RESHMA_FOLLOWUP']),
        systemPrompt: z.string().min(10).max(20000),
        voiceConfig: voiceConfigSchema.optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { personaId, systemPrompt, voiceConfig } = parsed.data;

    const config = await req.withTenant(async (tx) => {
      const latest = await tx.voiceAgentConfig.findFirst({
        where: { tenantId: req.auth.tenantId, personaId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      return tx.voiceAgentConfig.create({
        data: {
          tenantId: req.auth.tenantId,
          personaId,
          systemPrompt,
          version: (latest?.version ?? 0) + 1,
          isActive: false,
          createdByUserId: req.auth.userId,
          ...(voiceConfig !== undefined && { voiceConfig: voiceConfig as object }),
        },
      });
    });

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, personaId, version: config.version }, 'voice_agent.config_created');
    return reply.code(201).send({ data: config });
  });

  // POST /voice-agent/configs/:id/activate — activate a specific version
  app.post('/configs/:id/activate', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.configure')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };

    const target = await req.withTenant((tx) =>
      tx.voiceAgentConfig.findUnique({
        where: { id },
        select: { id: true, personaId: true, tenantId: true },
      }),
    );

    if (!target || target.tenantId !== req.auth.tenantId) {
      return reply.code(404).send({ error: { code: 'config.not_found', message: 'Config not found' } });
    }

    await req.withTenant(async (tx) => {
      await tx.voiceAgentConfig.updateMany({
        where: { tenantId: req.auth.tenantId, personaId: target.personaId },
        data: { isActive: false, activatedAt: null },
      });
      await tx.voiceAgentConfig.update({
        where: { id },
        data: { isActive: true, activatedAt: new Date() },
      });
    });

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, configId: id, personaId: target.personaId }, 'voice_agent.config_activated');
    return reply.send({ data: { activated: true } });
  });

  // POST /voice-agent/dial/:leadId — manual force-dial
  app.post('/dial/:leadId', async (req, reply) => {
    if (!can(req.auth.role, 'leads.dial.force')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { leadId } = req.params as { leadId: string };
    const { persona = 'RESHMA_VERIFY' } = req.body as { persona?: string };

    const lead = await req.withTenant((tx) =>
      tx.lead.findUnique({ where: { id: leadId }, select: { id: true, tenantId: true } }),
    );

    if (!lead) {
      return reply.code(404).send({ error: { code: 'lead.not_found', message: 'Lead not found' } });
    }

    await app.queues.voiceDial.add(
      'voice-dial',
      { leadId, tenantId: req.auth.tenantId, personaId: persona },
      { priority: 1 },
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId, persona }, 'voice_agent.manual_dial');
    return reply.code(202).send({ data: { queued: true } });
  });

  // GET /voice-agent/queue-stats — health of all voice-related BullMQ queues
  app.get('/queue-stats', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const [voiceDial, callWebhook, humanHandoff] = await Promise.all([
      app.queues.voiceDial.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      app.queues.callWebhook.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      app.queues.humanHandoff.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    ]);

    return reply.send({
      data: {
        voiceDial,
        callWebhook,
        humanHandoff,
      },
    });
  });

  // GET /voice-agent/test-payload/:personaId — preview the exact Vapi payload without making a call
  app.get('/test-payload/:personaId', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { personaId } = req.params as { personaId: string };
    const validPersonas = ['RESHMA_VERIFY', 'KARTHIK_SALES', 'RESHMA_FOLLOWUP'];
    if (!validPersonas.includes(personaId)) {
      return reply.code(400).send({ error: { code: 'invalid_persona', message: 'Invalid personaId' } });
    }

    const activeConfig = await req.withTenant((tx) =>
      tx.voiceAgentConfig.findFirst({
        where: { tenantId: req.auth.tenantId, personaId, isActive: true },
        select: { id: true, version: true, systemPrompt: true, voiceConfig: true, activatedAt: true },
      }),
    );

    if (!activeConfig) {
      return reply.send({ data: { hasConfig: false, payload: null } });
    }

    const vc = (activeConfig.voiceConfig ?? {}) as Record<string, unknown>;
    const webhookUrl = `${env.API_URL}/api/v1/webhooks/vapi`;

    const sttProvider = (vc['sttProvider'] as string | undefined) ?? 'sarvam';
    const llmProvider = (vc['llmProvider'] as string | undefined) ?? 'google/gemini-2.5-flash';
    const ttsProvider = (vc['ttsProvider'] as string | undefined) ?? 'elevenlabs';
    const voiceId = (vc['voiceId'] as string | undefined) ?? (personaId === 'KARTHIK_SALES' ? 'edapadi' : 'mk-tamil-v1');
    const voiceSpeed = (vc['voiceSpeed'] as number | undefined) ?? 1.0;
    const language = (vc['language'] as string | undefined) ?? 'ta';
    const firstMessage = vc['firstMessage'] as string | undefined;
    const responseTiming = (vc['responseTiming'] as string | undefined) ?? 'balanced';
    const maxDurationSec = (vc['maxDurationSec'] as number | undefined) ?? 300;
    const idleTimeoutSec = (vc['idleTimeoutSec'] as number | undefined) ?? 15;

    const lang = language === 'ta' ? 'ta-IN' : 'en-IN';
    const endpointingMs = responseTiming === 'low_latency' ? 100 : responseTiming === 'conservative' ? 500 : 300;

    const transcriber =
      sttProvider === 'sarvam' ? { provider: 'sarvam', model: 'sarvam-2b', language: lang } :
      sttProvider === 'deepgram' ? { provider: 'deepgram', model: 'nova-3-general', language: lang === 'ta-IN' ? 'ta' : 'en-IN' } :
      { provider: 'google', model: 'latest_long', language: lang };

    const llmParts = llmProvider.split('/');
    const modelProvider = llmParts.length === 2 ? llmParts[0] : 'google';
    const modelName = llmParts.length === 2 ? llmParts[1] : llmProvider;

    const payload = {
      assistant: {
        transcriber,
        model: {
          provider: modelProvider,
          model: modelName,
          messages: [{ role: 'system', content: activeConfig.systemPrompt }],
          tools: `[${personaId} tools — ${personaId === 'RESHMA_VERIFY' ? 'getLeadInfo, updateLeadStage, scheduleFollowUp, getProductInfo' : personaId === 'KARTHIK_SALES' ? 'getLeadInfo, updateLeadStage, scheduleAppointment, getProductInfo, scheduleFollowUp' : 'getLeadInfo, getFollowUpContext, updateConversionStatus, rescheduleFollowUp, scheduleFollowUp'} → ${webhookUrl}]`,
        },
        voice: {
          provider: ttsProvider === 'elevenlabs' ? '11labs' : ttsProvider,
          voiceId,
          speed: voiceSpeed,
          stability: 0.5,
          similarityBoost: 0.75,
        },
        ...(firstMessage && { firstMessage }),
        silenceTimeoutSeconds: idleTimeoutSec,
        maxDurationSeconds: maxDurationSec,
        endpointing: endpointingMs,
        serverUrl: webhookUrl,
      },
      customer: { number: '<lead.phone>', name: '<lead.name>' },
      phoneNumberId: '<VAPI_PHONE_NUMBER_ID>',
    };

    return reply.send({
      data: {
        hasConfig: true,
        configId: activeConfig.id,
        version: activeConfig.version,
        activatedAt: activeConfig.activatedAt,
        payload,
      },
    });
  });

  // POST /voice-agent/test-dial — fire a real Vapi call to a test number
  app.post('/test-dial', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.configure')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = z.object({
      phone: z.string().min(10).max(15),
      name: z.string().default('Test Lead'),
      personaId: z.enum(['RESHMA_VERIFY', 'KARTHIK_SALES', 'RESHMA_FOLLOWUP']),
    }).safeParse(req.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { phone, name, personaId } = parsed.data;

    const lead = await req.withTenant((tx) =>
      tx.lead.create({
        data: {
          tenantId: req.auth.tenantId,
          name,
          phone,
          phoneRaw: phone,
          sourceType: 'MANUAL',
          stage: 'NEW',
          language: 'Tamil',
          factSheet: { isTestLead: true } as object,
        },
        select: { id: true },
      }),
    );

    const job = await app.queues.voiceDial.add(
      'voice-dial',
      { leadId: lead.id, tenantId: req.auth.tenantId, personaId },
      { priority: 1 },
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId: lead.id, personaId, phone }, 'voice_agent.test_dial');
    return reply.code(202).send({ data: { queued: true, leadId: lead.id, jobId: job.id } });
  });

  // GET /voice-agent/recent-calls — last 20 calls with job logs
  app.get('/recent-calls', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const calls = await req.withTenant((tx) =>
      tx.call.findMany({
        where: { tenantId: req.auth.tenantId, direction: 'OUTBOUND' },
        orderBy: { initiatedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          vapiCallId: true,
          persona: true,
          status: true,
          durationSec: true,
          initiatedAt: true,
          connectedAt: true,
          endedAt: true,
          endReason: true,
          abVariant: true,
          lead: { select: { name: true, phone: true, stage: true } },
          llmAnalysis: true,
        },
      }),
    );

    return reply.send({ data: calls });
  });

  // GET /voice-agent/recent-calls/:callId/transcript — full transcript for a call
  app.get('/recent-calls/:callId/transcript', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { callId } = req.params as { callId: string };

    const call = await req.withTenant((tx) =>
      tx.call.findUnique({
        where: { id: callId },
        select: { id: true, transcript: true, llmAnalysis: true, vapiCallId: true, persona: true },
      }),
    );

    if (!call) {
      return reply.code(404).send({ error: { code: 'call.not_found', message: 'Call not found' } });
    }

    return reply.send({ data: call });
  });

  // GET /voice-agent/voices — list voices from ElevenLabs (cloned + premade)
  app.get('/voices', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    if (!env.ELEVENLABS_API_KEY) {
      return reply.code(503).send({ error: { code: 'not_configured', message: 'ElevenLabs API key not configured' } });
    }

    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
    });

    if (!res.ok) {
      req.log.warn({ tenantId: req.auth.tenantId, status: res.status }, 'elevenlabs.list_voices_failed');
      return reply.code(502).send({ error: { code: 'upstream_error', message: 'Failed to fetch voices from ElevenLabs' } });
    }

    const body = await res.json() as { voices: ElevenLabsVoice[] };
    return reply.send({ data: body.voices });
  });

  // POST /voice-agent/voices — clone a voice from uploaded audio samples
  app.post('/voices', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.configure')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    if (!env.ELEVENLABS_API_KEY) {
      return reply.code(503).send({ error: { code: 'not_configured', message: 'ElevenLabs API key not configured' } });
    }

    const form = new FormData();
    let hasFile = false;

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        form.append('files', new Blob([Buffer.concat(chunks)], { type: part.mimetype }), part.filename);
        hasFile = true;
      } else {
        form.append(part.fieldname, part.value as string);
      }
    }

    if (!hasFile) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'At least one audio file is required' } });
    }

    const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
      body: form,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null) as { detail?: { message?: string } } | null;
      req.log.warn({ tenantId: req.auth.tenantId, status: res.status, detail: errBody }, 'elevenlabs.create_voice_failed');
      const msg = errBody?.detail?.message ?? 'Failed to create voice on ElevenLabs';
      return reply.code(502).send({ error: { code: 'upstream_error', message: msg } });
    }

    const created = await res.json() as { voice_id: string };
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, voiceId: created.voice_id }, 'voice_agent.voice_cloned');
    return reply.code(201).send({ data: { voiceId: created.voice_id } });
  });

  // ─── LiveKit endpoints ─────────────────────────────────────────────────────

  // POST /voice-agent/agent-function — called by Python LiveKit agent for function calls
  // Not protected by session auth — uses x-agent-secret shared secret instead
  app.post('/agent-function', { config: { public: true } }, async (req, reply) => {
    const agentSecret = req.headers['x-agent-secret'] as string | undefined;
    if (!env.AGENT_WEBHOOK_SECRET) {
      return reply.code(503).send({ error: { code: 'not_configured', message: 'AGENT_WEBHOOK_SECRET not set' } });
    }
    if (!agentSecret) {
      return reply.code(401).send({ error: { code: 'unauthenticated', message: 'x-agent-secret header required' } });
    }
    // Constant-time comparison to prevent timing attacks
    const expectedBuf = Buffer.from(env.AGENT_WEBHOOK_SECRET);
    const actualBuf = Buffer.from(agentSecret);
    const secretsMatch =
      expectedBuf.length === actualBuf.length &&
      crypto.timingSafeEqual(expectedBuf, actualBuf);
    if (!secretsMatch) {
      req.log.warn('agent-function: invalid x-agent-secret');
      return reply.code(401).send({ error: { code: 'unauthenticated', message: 'Invalid agent secret' } });
    }

    const bodySchema = z.object({
      callId: z.string().min(1),
      tenantId: z.string().min(1),
      leadId: z.string().min(1),
      action: z.string().min(1),
      payload: z.record(z.unknown()).optional().default({}),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { callId, tenantId, leadId, action, payload: actionPayload } = parsed.data;

    const PRODUCT_CATALOG: Record<string, unknown> = {
      residential: {
        capacities: ['1kW', '2kW', '3kW', '5kW', '10kW'],
        pricePerKw: 55000,
        subsidyScheme: 'PM Surya Ghar — up to ₹78,000 subsidy for 3kW',
        warranty: { panel: '25 years', inverter: '5 years', installation: '1 year' },
        avgMonthlyBillOffset: '80–100%',
        roiYears: 4.5,
        notes: 'Best for homes with bill > ₹2,000/month',
      },
      commercial: {
        capacities: ['10kW', '25kW', '50kW', '100kW', '250kW'],
        pricePerKw: 48000,
        subsidyScheme: 'MNRE CAPEX subsidy — varies by state',
        warranty: { panel: '25 years', inverter: '10 years', installation: '2 years' },
        avgMonthlyBillOffset: '60–80%',
        roiYears: 3.5,
        notes: 'Accelerated depreciation benefit of 40%',
      },
      industrial: {
        capacities: ['100kW', '250kW', '500kW', '1MW+'],
        pricePerKw: 42000,
        subsidyScheme: 'No subsidy — REC mechanism available',
        warranty: { panel: '25 years', inverter: '10 years', installation: '3 years' },
        avgMonthlyBillOffset: '50–70%',
        roiYears: 3.0,
        notes: 'Group captive and third-party sale options',
      },
      offgrid: {
        capacities: ['1kW', '2kW', '5kW'],
        pricePerKw: 75000,
        subsidyScheme: 'PM KUSUM for agriculture — up to 60% subsidy',
        warranty: { panel: '25 years', battery: '5 years', inverter: '3 years' },
        avgMonthlyBillOffset: '100% (off-grid)',
        roiYears: 6.0,
        notes: 'Includes battery storage for 24/7 power',
      },
    };

    try {
      switch (action) {
        case 'getActiveConfig': {
          const call = await withSystemContext(prisma, tenantId, (tx) =>
            tx.call.findUnique({
              where: { id: callId },
              select: { persona: true },
            }),
          );
          if (!call) return reply.code(404).send({ error: { code: 'call.not_found', message: 'Call not found' } });

          const config = await withSystemContext(prisma, tenantId, (tx) =>
            tx.voiceAgentConfig.findFirst({
              where: { tenantId, personaId: call.persona, isActive: true },
              select: { systemPrompt: true, voiceConfig: true, personaId: true, version: true },
            }),
          );
          req.log.info({ tenantId, callId, persona: call.persona }, 'agent_function.getActiveConfig');
          return reply.send({ data: config ?? null, message: 'ok' });
        }

        case 'getLeadInfo': {
          const lead = await withSystemContext(prisma, tenantId, (tx) =>
            tx.lead.findUnique({
              where: { id: leadId },
              select: { id: true, name: true, phone: true, city: true, stage: true, factSheet: true, language: true },
            }),
          );
          req.log.info({ tenantId, callId, leadId }, 'agent_function.getLeadInfo');
          return reply.send({ data: lead ?? null, message: 'ok' });
        }

        case 'updateLeadStage': {
          const stagePayload = actionPayload as { stage?: unknown; scheduledAt?: unknown };
          const stageSchema = z.object({
            stage: z.enum(['QUALIFIED', 'NOT_ANSWERED', 'INVALID', 'WRONG_ENQUIRY', 'FOLLOW_UP', 'CONVERTED']),
            scheduledAt: z.string().optional(),
          });
          const stageResult = stageSchema.safeParse(stagePayload);
          if (!stageResult.success) {
            return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid stage payload', details: stageResult.error.flatten() } });
          }
          const { stage, scheduledAt } = stageResult.data;

          await withSystemContext(prisma, tenantId, async (tx) => {
            await tx.lead.update({
              where: { id: leadId },
              data: { stage: stage as never, stageChangedAt: new Date() },
            });
            await tx.leadActivity.create({
              data: {
                leadId,
                tenantId,
                actorIsAi: true,
                type: 'STAGE_CHANGE',
                payload: { newStage: stage, ...(scheduledAt && { scheduledAt }), source: 'livekit_agent' } as object,
              },
            });
          });

          req.log.info({ tenantId, callId, leadId, stage }, 'agent_function.updateLeadStage');
          return reply.send({ data: { success: true, stage }, message: 'ok' });
        }

        case 'scheduleFollowUp': {
          const fpPayload = actionPayload as { scheduledAt?: unknown };
          const fpSchema = z.object({ scheduledAt: z.string() });
          const fpResult = fpSchema.safeParse(fpPayload);
          if (!fpResult.success) {
            return reply.code(400).send({ error: { code: 'validation_error', message: 'scheduledAt required', details: fpResult.error.flatten() } });
          }
          const followUpDate = new Date(fpResult.data.scheduledAt);
          if (isNaN(followUpDate.getTime())) {
            return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid scheduledAt datetime' } });
          }

          await withSystemContext(prisma, tenantId, async (tx) => {
            await tx.lead.update({
              where: { id: leadId },
              data: { stage: 'FOLLOW_UP', stageChangedAt: new Date() },
            });
            await tx.leadActivity.create({
              data: {
                leadId,
                tenantId,
                actorIsAi: true,
                type: 'STAGE_CHANGE',
                payload: { newStage: 'FOLLOW_UP', scheduledAt: fpResult.data.scheduledAt, source: 'livekit_agent' } as object,
              },
            });
          });

          const delayMs = Math.max(followUpDate.getTime() - Date.now(), 60_000);
          await req.server.redis.publish('schedule:followup', JSON.stringify({
            leadId,
            tenantId,
            personaId: 'RESHMA_FOLLOWUP',
            delayMs,
          }));

          req.log.info({ tenantId, callId, leadId, scheduledAt: fpResult.data.scheduledAt }, 'agent_function.scheduleFollowUp');
          return reply.send({ data: { success: true, scheduledAt: fpResult.data.scheduledAt }, message: 'ok' });
        }

        case 'getProductInfo': {
          const piPayload = actionPayload as { category?: unknown };
          const category = typeof piPayload.category === 'string' ? piPayload.category : '';
          const info = PRODUCT_CATALOG[category];
          if (!info) {
            return reply.code(400).send({ error: { code: 'validation_error', message: `Unknown category: ${category}` } });
          }
          return reply.send({ data: info, message: 'ok' });
        }

        case 'scheduleAppointment': {
          const apptPayload = actionPayload as { scheduledAt?: unknown; siteAddress?: unknown; surveyType?: unknown };
          const apptSchema = z.object({
            scheduledAt: z.string(),
            siteAddress: z.string(),
            surveyType: z.enum(['ROOFTOP_RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'OFFGRID']),
          });
          const apptResult = apptSchema.safeParse(apptPayload);
          if (!apptResult.success) {
            return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid appointment payload', details: apptResult.error.flatten() } });
          }
          const apptDate = new Date(apptResult.data.scheduledAt);
          if (isNaN(apptDate.getTime())) {
            return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid scheduledAt datetime' } });
          }

          const appointment = await withSystemContext(prisma, tenantId, async (tx) => {
            const created = await tx.appointment.create({
              data: {
                tenantId,
                leadId,
                scheduledAt: apptDate,
                surveyType: apptResult.data.surveyType as never,
                siteAddress: apptResult.data.siteAddress,
                createdByCallId: callId,
              },
              select: { id: true, scheduledAt: true, surveyType: true },
            });
            await tx.lead.update({
              where: { id: leadId },
              data: { stage: 'FOLLOW_UP', stageChangedAt: new Date() },
            });
            await tx.leadActivity.create({
              data: {
                leadId,
                tenantId,
                actorIsAi: true,
                type: 'APPOINTMENT_BOOKED',
                payload: { appointmentId: created.id, scheduledAt: apptResult.data.scheduledAt, siteAddress: apptResult.data.siteAddress, source: 'livekit_agent' } as object,
              },
            });
            return created;
          });

          req.log.info({ tenantId, callId, leadId, appointmentId: appointment.id }, 'agent_function.scheduleAppointment');
          return reply.send({ data: { success: true, appointmentId: appointment.id, scheduledAt: apptResult.data.scheduledAt }, message: 'ok' });
        }

        case 'getFollowUpContext': {
          const [activities, previousCalls] = await withSystemContext(prisma, tenantId, async (tx) =>
            Promise.all([
              tx.leadActivity.findMany({
                where: { leadId },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: { type: true, payload: true, createdAt: true },
              }),
              tx.call.findMany({
                where: { leadId },
                orderBy: { initiatedAt: 'desc' },
                take: 3,
                select: { persona: true, status: true, durationSec: true, endReason: true, initiatedAt: true },
              }),
            ]),
          );
          req.log.info({ tenantId, callId, leadId }, 'agent_function.getFollowUpContext');
          return reply.send({ data: { activities, previousCalls }, message: 'ok' });
        }

        case 'updateConversionStatus': {
          const csPayload = actionPayload as { status?: unknown };
          const stageMap: Record<string, string> = {
            CONVERTED: 'CONVERTED',
            INVALID: 'INVALID',
            RESCHEDULED: 'FOLLOW_UP',
          };
          const status = typeof csPayload.status === 'string' ? csPayload.status : '';
          const newStage = stageMap[status];
          if (!newStage) {
            return reply.code(400).send({ error: { code: 'validation_error', message: `Invalid status: ${status}` } });
          }

          await withSystemContext(prisma, tenantId, async (tx) => {
            await tx.lead.update({
              where: { id: leadId },
              data: { stage: newStage as never, stageChangedAt: new Date() },
            });
            await tx.leadActivity.create({
              data: {
                leadId,
                tenantId,
                actorIsAi: true,
                type: 'STAGE_CHANGE',
                payload: { newStage, conversionStatus: status, source: 'livekit_agent' } as object,
              },
            });
          });

          req.log.info({ tenantId, callId, leadId, status, newStage }, 'agent_function.updateConversionStatus');
          return reply.send({ data: { success: true, stage: newStage }, message: 'ok' });
        }

        case 'rescheduleFollowUp': {
          const rfPayload = actionPayload as { scheduledAt?: unknown };
          const rfSchema = z.object({ scheduledAt: z.string() });
          const rfResult = rfSchema.safeParse(rfPayload);
          if (!rfResult.success) {
            return reply.code(400).send({ error: { code: 'validation_error', message: 'scheduledAt required', details: rfResult.error.flatten() } });
          }
          const reschedDate = new Date(rfResult.data.scheduledAt);
          if (isNaN(reschedDate.getTime())) {
            return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid scheduledAt datetime' } });
          }

          await withSystemContext(prisma, tenantId, (tx) =>
            tx.leadActivity.create({
              data: {
                leadId,
                tenantId,
                actorIsAi: true,
                type: 'NOTE',
                payload: { note: `Follow-up rescheduled to ${rfResult.data.scheduledAt}`, source: 'livekit_agent' } as object,
              },
            }),
          );

          const rfDelayMs = Math.max(reschedDate.getTime() - Date.now(), 60_000);
          await req.server.redis.publish('schedule:followup', JSON.stringify({
            leadId,
            tenantId,
            personaId: 'RESHMA_FOLLOWUP',
            delayMs: rfDelayMs,
          }));

          req.log.info({ tenantId, callId, leadId, scheduledAt: rfResult.data.scheduledAt }, 'agent_function.rescheduleFollowUp');
          return reply.send({ data: { success: true, scheduledAt: rfResult.data.scheduledAt }, message: 'ok' });
        }

        case 'callEnded': {
          const cePayload = actionPayload as { endedAt?: unknown; durationSec?: unknown; endReason?: unknown };
          const endedAt = typeof cePayload.endedAt === 'string' ? new Date(cePayload.endedAt) : new Date();
          const durationSec = typeof cePayload.durationSec === 'number' ? Math.round(cePayload.durationSec) : null;
          const endReason = typeof cePayload.endReason === 'string' ? cePayload.endReason : null;

          await withSystemContext(prisma, tenantId, (tx) =>
            tx.call.update({
              where: { id: callId },
              data: {
                status: 'COMPLETED',
                endedAt,
                ...(durationSec !== null && { durationSec }),
                ...(endReason !== null && { endReason }),
              },
            }),
          );

          // If the lead is still NOT_ANSWERED, schedule a retry
          const lead = await withSystemContext(prisma, tenantId, (tx) =>
            tx.lead.findUnique({
              where: { id: leadId },
              select: { stage: true },
            }),
          );
          if (lead?.stage === 'NOT_ANSWERED') {
            const settings = await withSystemContext(prisma, tenantId, (tx) =>
              tx.voiceAgentSettings.findUnique({
                where: { tenantId },
                select: { retryConfig: true },
              }),
            );
            const retryConfig = (settings?.retryConfig ?? {}) as Record<string, unknown>;
            const retryHours = typeof retryConfig['retryIntervalHours'] === 'number' ? retryConfig['retryIntervalHours'] : 2;
            const retryDelayMs = retryHours * 60 * 60 * 1000;
            await app.queues.voiceDial.add(
              'voice-dial',
              { leadId, tenantId, personaId: 'RESHMA_VERIFY' },
              { delay: retryDelayMs },
            );
            req.log.info({ tenantId, callId, leadId, retryHours }, 'agent_function.callEnded.retry_scheduled');
          }

          req.log.info({ tenantId, callId, leadId, durationSec, endReason }, 'agent_function.callEnded');
          return reply.send({ data: { success: true }, message: 'ok' });
        }

        default:
          return reply.code(400).send({ error: { code: 'unknown_action', message: `Unknown action: ${action}` } });
      }
    } catch (err) {
      req.log.error({ tenantId, callId, leadId, action, err }, 'agent_function.error');
      return reply.code(500).send({ error: { code: 'internal_error', message: 'Internal server error' } });
    }
  });

  // GET /voice-agent/rooms — list active LiveKit rooms
  app.get('/rooms', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      return reply.send({ data: [] });
    }

    const roomService = new RoomServiceClient(
      env.LIVEKIT_URL,
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET,
    );

    const rooms = await roomService.listRooms();
    const mapped = rooms.map((r) => ({
      name: r.name,
      metadata: r.metadata ?? null,
      numParticipants: r.numParticipants,
      creationTime: Number(r.creationTime),
    }));

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, count: mapped.length }, 'voice_agent.rooms.list');
    return reply.send({ data: mapped });
  });

  // POST /voice-agent/rooms/:name/token — mint browser access token for a room (read-only observer)
  app.post('/rooms/:name/token', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      return reply.code(503).send({ error: { code: 'not_configured', message: 'LiveKit credentials not configured' } });
    }

    const { name } = req.params as { name: string };

    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: `monitor-${req.auth.userId}`,
      ttl: 3600,
    });
    at.addGrant({ roomJoin: true, room: name, canSubscribe: true, canPublish: false });

    const token = await at.toJwt();

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, roomName: name }, 'voice_agent.rooms.token_minted');
    return reply.send({ data: { token, wsUrl: env.LIVEKIT_URL } });
  });

  // POST /voice-agent/playground/chat — in-app chat testing without outbound calls
  app.post('/playground/chat', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const historyItemSchema = z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    });

    const parsed = z.object({
      personaId: z.enum(['RESHMA_VERIFY', 'KARTHIK_SALES', 'RESHMA_FOLLOWUP']),
      message: z.string().min(1).max(2000),
      history: z.array(historyItemSchema).default([]),
      simulatedLead: z.object({
        name: z.string().default('Test Lead'),
        phone: z.string().default('+91 9999999999'),
        city: z.string().default('Coimbatore'),
        stage: z.string().default('NEW'),
      }).default({}),
    }).safeParse(req.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    if (!env.GROQ_API_KEY) {
      return reply.code(503).send({ error: { code: 'not_configured', message: 'GROQ_API_KEY not configured — add it to environment variables' } });
    }

    const { personaId, message, history, simulatedLead } = parsed.data;

    const activeConfig = await req.withTenant((tx) =>
      tx.voiceAgentConfig.findFirst({
        where: { tenantId: req.auth.tenantId, personaId, isActive: true },
        select: { systemPrompt: true, version: true },
      }),
    );

    const systemPrompt = activeConfig?.systemPrompt ?? playgroundDefaultPrompt(personaId, simulatedLead);

    interface GroqToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
    interface GroqMessage { role: string; content: string | null; tool_calls?: GroqToolCall[] }
    interface GroqChoice { message: GroqMessage; finish_reason: string }
    interface GroqResponse { choices: GroqChoice[] }

    const currentMessages: object[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message },
    ];

    const tools = playgroundTools(personaId);
    const toolCallLog: Array<{ name: string; args: Record<string, unknown>; result: unknown }> = [];

    let finalReply = '';
    for (let i = 0; i < 3; i++) {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: currentMessages,
          tools,
          tool_choice: 'auto',
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        req.log.warn({ tenantId: req.auth.tenantId, personaId, status: groqRes.status, body: errText }, 'playground.groq_error');
        return reply.code(502).send({ error: { code: 'groq_error', message: 'LLM API returned an error' } });
      }

      const groqBody = (await groqRes.json()) as GroqResponse;
      const choice = groqBody.choices[0];
      if (!choice) break;

      if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
        currentMessages.push({
          role: 'assistant',
          content: choice.message.content ?? null,
          tool_calls: choice.message.tool_calls,
        });
        for (const tc of choice.message.tool_calls) {
          const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          const result = playgroundSimulateTool(tc.function.name, args, simulatedLead);
          toolCallLog.push({ name: tc.function.name, args, result });
          currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        }
      } else {
        finalReply = choice.message.content ?? '';
        break;
      }
    }

    const newHistory = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: finalReply },
    ];

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, personaId, toolCalls: toolCallLog.length }, 'playground.chat');
    return reply.send({ data: { reply: finalReply, toolCalls: toolCallLog, newHistory } });
  });

  // DELETE /voice-agent/voices/:voiceId — delete a cloned voice
  app.delete('/voices/:voiceId', async (req, reply) => {
    if (!can(req.auth.role, 'voice_agent.configure')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    if (!env.ELEVENLABS_API_KEY) {
      return reply.code(503).send({ error: { code: 'not_configured', message: 'ElevenLabs API key not configured' } });
    }

    const { voiceId } = req.params as { voiceId: string };

    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      method: 'DELETE',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
    });

    if (!res.ok) {
      req.log.warn({ tenantId: req.auth.tenantId, voiceId, status: res.status }, 'elevenlabs.delete_voice_failed');
      return reply.code(502).send({ error: { code: 'upstream_error', message: 'Failed to delete voice from ElevenLabs' } });
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, voiceId }, 'voice_agent.voice_deleted');
    return reply.send({ data: { deleted: true } });
  });
};
