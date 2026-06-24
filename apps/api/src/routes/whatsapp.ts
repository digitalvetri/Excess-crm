import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { z } from 'zod';
import { env } from '@excess/config';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';

const s3 = new S3Client({ region: env.AWS_REGION });

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
  await app.register(multipart, { limits: { fileSize: 16 * 1024 * 1024 } });

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

    // Enrich with lead data + a last-message preview for each conversation.
    const leadIds = sessions.map((s) => s.leadId).filter(Boolean) as string[];
    const [leads, previews] = leadIds.length > 0
      ? await req.withTenant(async (tx) =>
          Promise.all([
            tx.lead.findMany({
              where: { id: { in: leadIds } },
              select: { id: true, name: true, phone: true, stage: true, aiScore: true, ownerUserId: true },
            }),
            tx.leadActivity.findMany({
              where: { leadId: { in: leadIds }, type: 'WHATSAPP' },
              orderBy: { createdAt: 'desc' },
              take: 200,
              select: { leadId: true, payload: true },
            }),
          ]),
        )
      : [[], []];

    const leadMap = new Map(leads.map((l) => [l.id, l]));
    const previewMap = new Map<string, string>();
    for (const a of previews) {
      if (a.leadId && !previewMap.has(a.leadId)) {
        const p = (a.payload ?? {}) as Record<string, unknown>;
        previewMap.set(a.leadId, String(p['message'] ?? p['template'] ?? p['text'] ?? '').slice(0, 80));
      }
    }

    // Assignee = the lead's owner (durable, no new schema). Status + unread are
    // Redis-backed triage state (low-stakes; tolerant of a reset).
    const ownerIds = [...new Set(leads.map((l) => l.ownerUserId).filter(Boolean))] as string[];
    const owners = ownerIds.length > 0
      ? await req.withTenant((tx) => tx.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } }))
      : [];
    const ownerMap = new Map(owners.map((u) => [u.id, u.name]));

    const [statuses, unreads] = leadIds.length > 0
      ? await Promise.all([
          app.redis.mget(leadIds.map((id) => `wa_status:${req.auth.tenantId}:${id}`)),
          app.redis.mget(leadIds.map((id) => `wa_unread:${req.auth.tenantId}:${id}`)),
        ])
      : [[], []];
    const statusMap = new Map(leadIds.map((id, i) => [id, statuses[i] || 'OPEN']));
    const unreadMap = new Map(leadIds.map((id, i) => [id, Number(unreads[i] ?? 0)]));

    const hasMore = sessions.length > limit;
    const items = hasMore ? sessions.slice(0, limit) : sessions;

    const result = items.map((s) => {
      const lead = leadMap.get(s.leadId);
      const ownerId = lead?.ownerUserId ?? null;
      return {
        ...s,
        lead: lead ? { name: lead.name, phone: lead.phone, stage: lead.stage, aiScore: lead.aiScore } : null,
        lastMessagePreview: previewMap.get(s.leadId) ?? null,
        assignee: ownerId ? { userId: ownerId, name: ownerMap.get(ownerId) ?? 'Unknown' } : null,
        status: statusMap.get(s.leadId) ?? 'OPEN',
        unread: unreadMap.get(s.leadId) ?? 0,
      };
    });

    return reply.send({
      data: { conversations: result, hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
    });
  });

  // PATCH /whatsapp/conversations/:leadId/status — triage status (Redis-backed).
  app.patch('/conversations/:leadId/status', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.own')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { leadId } = req.params as { leadId: string };
    const status = (req.body as { status?: string } | null)?.status;
    if (!status || !['OPEN', 'PENDING', 'RESOLVED'].includes(status)) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'status must be OPEN, PENDING or RESOLVED' } });
    }
    await app.redis.set(`wa_status:${req.auth.tenantId}:${leadId}`, status);
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId, status }, 'whatsapp.conversation_status');
    return reply.send({ data: { leadId, status } });
  });

  // POST /whatsapp/conversations/:leadId/read — clear the unread badge.
  app.post('/conversations/:leadId/read', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.own')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { leadId } = req.params as { leadId: string };
    await app.redis.del(`wa_unread:${req.auth.tenantId}:${leadId}`);
    return reply.send({ data: { leadId, unread: 0 } });
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
    const replyTo = (req.body as { replyTo?: { waId?: string; text?: string } }).replyTo;

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
      ...(replyTo?.waId ? { contextWaId: replyTo.waId } : {}),
    });

    await req.withTenant((tx) =>
      tx.leadActivity.create({
        data: {
          leadId,
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          actorIsAi: false,
          type: 'WHATSAPP',
          payload: {
            message,
            direction: 'outbound',
            ...(replyTo?.text ? { replyTo: { text: replyTo.text } } : {}),
          } as object,
        },
      }),
    );

    // AI acceptance analytics: if an AI draft was generated for this lead recently,
    // a send shortly after counts as "draft used".
    const draftedKey = `ai_drafted:${req.auth.tenantId}:${leadId}`;
    if (await app.redis.get(draftedKey)) {
      await app.redis.incr(`ai_metrics:${req.auth.tenantId}:drafts_accepted`);
      await app.redis.del(draftedKey);
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId }, 'whatsapp.message_queued');
    return reply.code(202).send({ data: { queued: true } });
  });

  // POST /whatsapp/send-template — send an approved template (works OUTSIDE the 24h
  // window). Reuses the same send worker, which builds the Meta template payload from
  // `vars` (positional, in insertion order).
  app.post('/send-template', async (req, reply) => {
    if (!can(req.auth.role, 'whatsapp.send')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const body = (req.body ?? {}) as {
      leadId?: string;
      templateName?: string;
      label?: string;
      params?: Record<string, string>;
    };
    const leadId = body.leadId;
    const templateName = body.templateName;
    if (!leadId || !templateName) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'leadId and templateName are required' } });
    }

    const lead = await req.withTenant((tx) =>
      tx.lead.findUnique({ where: { id: leadId }, select: { id: true, phone: true } }),
    );
    if (!lead) {
      return reply.code(404).send({ error: { code: 'lead.not_found', message: 'Lead not found' } });
    }

    await app.queues.whatsappSend.add('whatsapp-send', {
      tenantId: req.auth.tenantId,
      leadId,
      phone: lead.phone,
      template: templateName,
      vars: body.params ?? {},
    });

    await req.withTenant((tx) =>
      tx.leadActivity.create({
        data: {
          leadId,
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          actorIsAi: false,
          type: 'WHATSAPP',
          payload: { template: templateName, message: body.label ?? `Template: ${templateName}`, direction: 'outbound' } as object,
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId, template: templateName }, 'whatsapp.template_queued');
    return reply.code(202).send({ data: { queued: true } });
  });

  // GET /whatsapp/media/:activityId — short-lived presigned URL for a message's media
  // (downloaded to S3 by the inbound worker). Returns null url until the download lands.
  app.get('/media/:activityId', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.own')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { activityId } = req.params as { activityId: string };
    const act = await req.withTenant((tx) =>
      tx.leadActivity.findUnique({ where: { id: activityId }, select: { payload: true } }),
    );
    const media = ((act?.payload ?? {}) as Record<string, unknown>)['media'] as
      | { s3Key?: string; mime?: string; type?: string }
      | undefined;
    if (!media?.s3Key) {
      return reply.send({ data: { url: null, ready: false } });
    }
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET_ASSETS, Key: media.s3Key }), {
      expiresIn: 300,
    });
    return reply.send({ data: { url, ready: true, mime: media.mime ?? null, type: media.type ?? null } });
  });

  // POST /whatsapp/send-media — upload a file (multipart) → archive to S3 + upload to
  // Meta → send as a media message. Field `leadId` (+ optional `caption`) accompany the file.
  app.post('/send-media', async (req, reply) => {
    if (!can(req.auth.role, 'whatsapp.send')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'A file is required' } });
    }
    const leadId = (data.fields['leadId'] as { value?: string } | undefined)?.value;
    const caption = (data.fields['caption'] as { value?: string } | undefined)?.value ?? '';
    if (!leadId) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'leadId is required' } });
    }
    const buffer = await data.toBuffer();
    const mime = data.mimetype;
    const filename = data.filename || 'file';
    const mediaType = mime.startsWith('image/') ? 'image'
      : mime.startsWith('audio/') ? 'audio'
      : mime.startsWith('video/') ? 'video'
      : 'document';

    const [lead, cfg] = await req.withTenant((tx) =>
      Promise.all([
        tx.lead.findUnique({ where: { id: leadId }, select: { id: true, phone: true } }),
        tx.whatsappConfig.findUnique({ where: { tenantId: req.auth.tenantId }, select: { phoneNumberId: true, accessToken: true, isConnected: true } }),
      ]),
    );
    if (!lead) {
      return reply.code(404).send({ error: { code: 'lead.not_found', message: 'Lead not found' } });
    }
    const phoneNumberId = (cfg?.isConnected && cfg.phoneNumberId) || process.env['WHATSAPP_PHONE_NUMBER_ID'];
    const accessToken = (cfg?.isConnected && cfg.accessToken) || process.env['WHATSAPP_ACCESS_TOKEN'];
    if (!phoneNumberId || !accessToken) {
      return reply.code(400).send({ error: { code: 'whatsapp.not_connected', message: 'WhatsApp is not connected' } });
    }

    // 1. Archive to S3 (only the key is persisted).
    const s3Key = `whatsapp-media/${req.auth.tenantId}/${randomUUID()}`;
    await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET_ASSETS, Key: s3Key, Body: buffer, ContentType: mime }));

    // 2. Upload to Meta media to obtain a media id.
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mime);
    form.append('file', new Blob([buffer], { type: mime }), filename);
    const metaRes = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    if (!metaRes.ok) {
      req.log.error({ tenantId: req.auth.tenantId, leadId, status: metaRes.status }, 'whatsapp.media_upload_failed');
      return reply.code(502).send({ error: { code: 'whatsapp.media_upload_failed', message: 'Meta rejected the media upload' } });
    }
    const mediaId = ((await metaRes.json()) as { id?: string }).id;
    if (!mediaId) {
      return reply.code(502).send({ error: { code: 'whatsapp.media_upload_failed', message: 'Meta did not return a media id' } });
    }

    // 3. Enqueue the send + record the thread activity (rendered immediately via S3).
    await app.queues.whatsappSend.add('whatsapp-send', {
      tenantId: req.auth.tenantId,
      leadId,
      phone: lead.phone,
      template: 'MEDIA',
      vars: { mediaId, mediaType, caption, filename },
    });
    await req.withTenant((tx) =>
      tx.leadActivity.create({
        data: {
          leadId,
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          actorIsAi: false,
          type: 'WHATSAPP',
          payload: {
            message: caption || (mediaType === 'document' ? `📄 ${filename}` : mediaType === 'audio' ? '🎤 Voice note' : '📷 Photo'),
            direction: 'outbound',
            media: { type: mediaType, s3Key, mime, caption, filename },
          } as object,
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId, mediaType }, 'whatsapp.media_queued');
    return reply.code(202).send({ data: { queued: true } });
  });

  // POST /whatsapp/react — emoji-react to a message (sent natively via WhatsApp).
  // Needs the target message's wamid (we have it for inbound messages).
  app.post('/react', async (req, reply) => {
    if (!can(req.auth.role, 'whatsapp.send')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const body = (req.body ?? {}) as { leadId?: string; messageId?: string; waId?: string; emoji?: string };
    const leadId = body.leadId;
    const waId = body.waId;
    const emoji = body.emoji;
    if (!leadId || !waId || !emoji) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'leadId, waId and emoji are required' } });
    }

    const lead = await req.withTenant((tx) => tx.lead.findUnique({ where: { id: leadId }, select: { id: true, phone: true } }));
    if (!lead) {
      return reply.code(404).send({ error: { code: 'lead.not_found', message: 'Lead not found' } });
    }

    await app.queues.whatsappSend.add('whatsapp-send', {
      tenantId: req.auth.tenantId,
      leadId,
      phone: lead.phone,
      template: 'REACTION',
      vars: { waId, emoji },
    });

    // Reflect the reaction on the target message so the thread shows it immediately.
    const messageId = body.messageId;
    if (messageId) {
      await req.withTenant(async (tx) => {
        const act = await tx.leadActivity.findUnique({ where: { id: messageId }, select: { payload: true } });
        if (act) {
          const payload = { ...((act.payload ?? {}) as Record<string, unknown>), reaction: emoji };
          await tx.leadActivity.update({ where: { id: messageId }, data: { payload: payload as object } });
        }
      });
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId, emoji }, 'whatsapp.reaction_queued');
    return reply.code(202).send({ data: { reacted: true } });
  });
};
