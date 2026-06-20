import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { z } from 'zod';
import { env } from '@excess/config';

const sendMessageSchema = z.object({
  leadId: z.string().uuid(),
  message: z.string().min(1).max(4096),
});

const whatsappConfigSchema = z.object({
  phoneNumberId:      z.string().min(1, 'Phone Number ID is required'),
  businessAccountId:  z.string().min(1, 'Business Account ID is required'),
  accessToken:        z.string().min(10, 'Access token is required'),
  displayName:        z.string().max(100).optional(),
});

export const whatsappMessagingRoutes: FastifyPluginAsync = async (app) => {
  // GET /whatsapp/config — return saved WhatsApp Business config (token redacted)
  app.get('/config', async (req, reply) => {
    if (!can(req.auth.role, 'broadcasts.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const config = await req.withTenant((tx) =>
      tx.whatsappConfig.findUnique({ where: { tenantId: req.auth.tenantId } }),
    );

    if (!config) {
      return reply.send({ data: null });
    }

    const webhookUrl = `${env.API_URL}/webhooks/whatsapp`;

    return reply.send({
      data: {
        phoneNumberId:      config.phoneNumberId,
        businessAccountId:  config.businessAccountId,
        displayName:        config.displayName,
        webhookVerifyToken: config.webhookVerifyToken,
        webhookUrl,
        isConnected:        config.isConnected,
        connectedAt:        config.connectedAt,
        hasToken:           config.accessToken.length > 0,
      },
    });
  });

  // GET /whatsapp/status — can we actually send right now? Considers the
  // per-tenant config AND the env-var fallback the worker uses, so the UI can
  // honestly tell the user whether messages will be delivered.
  app.get('/status', async (req, reply) => {
    if (!can(req.auth.role, 'whatsapp.send')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const config = await req.withTenant((tx) =>
      tx.whatsappConfig.findUnique({
        where: { tenantId: req.auth.tenantId },
        select: { isConnected: true, phoneNumberId: true, accessToken: true },
      }),
    );

    const tenantConnected = Boolean(config?.isConnected && config.phoneNumberId && config.accessToken);
    const envConnected = Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN);
    const source = tenantConnected ? 'tenant' : envConnected ? 'env' : null;

    return reply.send({ data: { connected: tenantConnected || envConnected, source } });
  });

  // PUT /whatsapp/config — save or update WhatsApp Business credentials.
  // These are Meta API secrets — admin-only, like every other integration credential.
  app.put('/config', async (req, reply) => {
    if (!can(req.auth.role, 'integrations.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = whatsappConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { phoneNumberId, businessAccountId, accessToken, displayName } = parsed.data;

    // Verify credentials by calling Meta API before saving
    let displayNameFromMeta: string | null = null;
    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}?fields=display_phone_number%2Cverified_name`,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000) },
      );
      if (!metaRes.ok) throw new Error(`Meta API ${metaRes.status}`);
      const metaData = await metaRes.json() as { display_phone_number?: string; verified_name?: string };
      displayNameFromMeta = metaData.verified_name ?? metaData.display_phone_number ?? null;
    } catch {
      return reply.code(422).send({
        error: {
          code: 'whatsapp.invalid_credentials',
          message: 'Could not verify credentials with Meta — check your Phone Number ID and Access Token.',
        },
      });
    }

    const config = await req.withTenant((tx) =>
      tx.whatsappConfig.upsert({
        where:  { tenantId: req.auth.tenantId },
        update: {
          phoneNumberId,
          businessAccountId,
          accessToken,
          displayName: displayName ?? displayNameFromMeta ?? null,
          isConnected: true,
          connectedAt: new Date(),
        },
        create: {
          tenantId:         req.auth.tenantId,
          phoneNumberId,
          businessAccountId,
          accessToken,
          displayName:      displayName ?? displayNameFromMeta ?? null,
          isConnected:      true,
          connectedAt:      new Date(),
        },
      }),
    );

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId, phoneNumberId },
      'whatsapp.config_saved',
    );

    return reply.send({
      data: {
        phoneNumberId:      config.phoneNumberId,
        businessAccountId:  config.businessAccountId,
        displayName:        config.displayName,
        webhookVerifyToken: config.webhookVerifyToken,
        webhookUrl:         `${env.API_URL}/webhooks/whatsapp`,
        isConnected:        true,
      },
    });
  });

  // DELETE /whatsapp/config — disconnect WhatsApp (admin-only, like the write above)
  app.delete('/config', async (req, reply) => {
    if (!can(req.auth.role, 'integrations.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    await req.withTenant((tx) =>
      tx.whatsappConfig.deleteMany({ where: { tenantId: req.auth.tenantId } }),
    );

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId },
      'whatsapp.config_deleted',
    );

    return reply.send({ data: { disconnected: true } });
  });

  // GET /whatsapp/conversations — list active WaSessions for tenant
  app.get('/conversations', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.own')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { cursor?: string; limit?: string };
    const limit = Math.min(Number(query.limit ?? 20), 100);

    const sessions = await req.withTenant(async (tx) =>
      tx.waSession.findMany({
        where: {
          ...(query.cursor && { id: { lt: query.cursor } }),
        },
        orderBy: { lastMessageAt: 'desc' },
        take: limit + 1,
        select: {
          id: true,
          leadId: true,
          phone: true,
          sessionExpiresAt: true,
          lastMessageAt: true,
          createdAt: true,
        },
      }),
    );

    // Enrich with lead data — fetch leads for returned sessions
    const leadIds = sessions.map((s) => s.leadId).filter(Boolean) as string[];
    const leads = leadIds.length > 0
      ? await req.withTenant(async (tx) =>
          tx.lead.findMany({
            where: { id: { in: leadIds } },
            select: { id: true, name: true, phone: true, stage: true },
          }),
        )
      : [];

    const leadMap = new Map(leads.map((l) => [l.id, l]));

    const hasMore = sessions.length > limit;
    const items = hasMore ? sessions.slice(0, limit) : sessions;

    const result = items.map((s) => ({
      ...s,
      lead: leadMap.get(s.leadId) ?? null,
    }));

    return reply.send({
      data: { conversations: result, hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
    });
  });

  // GET /whatsapp/conversations/:leadId — WhatsApp message history for a lead
  app.get('/conversations/:leadId', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.own')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { leadId } = req.params as { leadId: string };

    const lead = await req.withTenant(async (tx) =>
      tx.lead.findUnique({ where: { id: leadId }, select: { id: true } }),
    );

    if (!lead) {
      return reply.code(404).send({ error: { code: 'lead.not_found', message: 'Lead not found' } });
    }

    const activities = await req.withTenant(async (tx) =>
      tx.leadActivity.findMany({
        where: { leadId, type: 'WHATSAPP' },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          actorUserId: true,
          actorIsAi: true,
          payload: true,
          createdAt: true,
        },
      }),
    );

    return reply.send({ data: { leadId, messages: activities } });
  });

  // POST /whatsapp/send — send a direct WhatsApp message to a lead
  app.post('/send', async (req, reply) => {
    if (!can(req.auth.role, 'whatsapp.send')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { leadId, message } = parsed.data;

    const lead = await req.withTenant(async (tx) =>
      tx.lead.findUnique({ where: { id: leadId }, select: { id: true, phone: true, name: true } }),
    );

    if (!lead) {
      return reply.code(404).send({ error: { code: 'lead.not_found', message: 'Lead not found' } });
    }

    await app.queues.whatsappSend.add('whatsapp-send', {
      tenantId: req.auth.tenantId,
      leadId,
      phone: lead.phone,
      template: 'DIRECT_MESSAGE',
      vars: { message },
    });

    await req.withTenant((tx) =>
      tx.leadActivity.create({
        data: {
          leadId,
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          actorIsAi: false,
          type: 'WHATSAPP',
          payload: { message, direction: 'outbound' } as object,
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId }, 'whatsapp.message_queued');
    return reply.code(202).send({ data: { queued: true } });
  });
};
