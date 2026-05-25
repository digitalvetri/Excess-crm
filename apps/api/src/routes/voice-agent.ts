import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { z } from 'zod';

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

    const parsed = z
      .object({
        personaId: z.enum(['RESHMA_VERIFY', 'KARTHIK_SALES', 'RESHMA_FOLLOWUP']),
        systemPrompt: z.string().min(10).max(20000),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { personaId, systemPrompt } = parsed.data;

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
};
