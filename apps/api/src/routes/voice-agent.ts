import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { can } from '@excess/shared';
import { z } from 'zod';
import { env } from '@excess/config';

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
