import type { FastifyPluginAsync, FastifyBaseLogger } from 'fastify';
import crypto from 'crypto';
import { env } from '@excess/config';
import { prisma, withSystemContext, SYSTEM_TENANT_ID } from '@excess/db';

/**
 * If the sender has a pending NPS request and replied with a 0-10 score,
 * record it on the Review row and clear the pending flag. Returns true
 * when the message was consumed as an NPS response.
 */
async function tryCaptureNps(
  tenantId: string,
  phone: string,
  text: string,
  log: FastifyBaseLogger,
): Promise<boolean> {
  const session = await withSystemContext(prisma, tenantId, (tx) =>
    tx.waSession.findUnique({
      where: { tenantId_phone: { tenantId, phone } },
      select: { npsPendingProjectId: true },
    }),
  );
  if (!session?.npsPendingProjectId) return false;

  const firstToken = text.trim().split(/\s+/)[0] ?? '';
  if (!/^(10|[0-9])$/.test(firstToken)) return false;
  const score = Number(firstToken);
  const comment = text.trim().slice(firstToken.length).trim();
  const projectId = session.npsPendingProjectId;

  await withSystemContext(prisma, tenantId, async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { leadId: true },
    });
    if (!project) return;

    const review = await tx.review.findFirst({
      where: { leadId: project.leadId, npsRequestedAt: { not: null }, npsRespondedAt: null },
      orderBy: { npsRequestedAt: 'desc' },
      select: { id: true },
    });
    if (review) {
      await tx.review.update({
        where: { id: review.id },
        data: { npsScore: score, npsRespondedAt: new Date(), ...(comment && { npsComment: comment }) },
      });
    }

    await tx.waSession.update({
      where: { tenantId_phone: { tenantId, phone } },
      data: { npsPendingProjectId: null },
    });

    await tx.leadActivity.create({
      data: {
        leadId: project.leadId,
        tenantId,
        actorIsAi: true,
        type: 'NOTE',
        payload: {
          note: `📊 NPS response: ${score}/10${comment ? ` — "${comment}"` : ''}`,
          npsScore: score,
        } as object,
      },
    });
  });

  log.info({ tenantId, projectId, npsScore: score }, 'nps.captured');
  return true;
}

interface WaMedia {
  id?: string;
  caption?: string;
  filename?: string;
  mime_type?: string;
}

interface WaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: WaMedia;
  document?: WaMedia;
  audio?: WaMedia;
  video?: WaMedia;
  sticker?: WaMedia;
}

interface WaWebhookBody {
  object: string;
  entry: {
    id: string;
    changes: {
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: { profile: { name: string }; wa_id: string }[];
        messages?: WaMessage[];
        statuses?: unknown[];
      };
      field: string;
    }[];
  }[];
}

function verifyWa(rawBody: string, signature: string): boolean {
  if (!env.META_WEBHOOK_APP_SECRET) return false;
  const expected = `sha256=${crypto
    .createHmac('sha256', env.META_WEBHOOK_APP_SECRET)
    .update(rawBody)
    .digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export const whatsappWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.get('/whatsapp', { config: { public: true } }, async (req, reply) => {
    const q = req.query as Record<string, string>;
    if (
      q['hub.mode'] === 'subscribe' &&
      q['hub.verify_token'] === env.META_WEBHOOK_VERIFY_TOKEN
    ) {
      return reply.send(q['hub.challenge']);
    }
    return reply.code(403).send('Forbidden');
  });

  app.post('/whatsapp', { config: { public: true } }, async (req, reply) => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = req.rawBody ?? JSON.stringify(req.body);

    if (!signature || !verifyWa(rawBody, signature)) {
      req.log.warn('WhatsApp webhook HMAC mismatch');
      return reply.code(200).send('ok');
    }

    const body = req.body as WaWebhookBody;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        const v = change.value;
        const phoneNumberId = v.metadata.phone_number_id;

        // Cross-tenant admin lookup — phoneNumberId identifies tenant
        const sources = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
          tx.leadSource.findMany({
            where: { type: 'WHATSAPP', isActive: true },
            select: { id: true, tenantId: true, config: true },
          }),
        );
        const source = sources.find((s) => {
          const cfg = s.config as Record<string, unknown>;
          return cfg['phoneNumberId'] === phoneNumberId;
        });
        if (!source) continue;

        for (const msg of v.messages ?? []) {
          // Inbound media (image / document / audio / video / sticker): record it so
          // it appears in the thread instead of vanishing. We store the Meta media id
          // for a later download-to-S3 step; the thread shows a labelled placeholder.
          if (msg.type !== 'text') {
            if (['image', 'document', 'audio', 'video', 'sticker'].includes(msg.type)) {
              const mediaLead = await withSystemContext(prisma, source.tenantId, (tx) =>
                tx.lead.findFirst({
                  where: { tenantId: source.tenantId, phone: msg.from, isDuplicate: false },
                  select: { id: true },
                  orderBy: { createdAt: 'desc' },
                }),
              );
              if (mediaLead) {
                const media = (msg as unknown as Record<string, WaMedia | undefined>)[msg.type];
                const label =
                  msg.type === 'document' ? `📄 ${media?.filename ?? 'Document'}`
                  : msg.type === 'audio' ? '🎤 Voice note'
                  : msg.type === 'image' ? '📷 Photo'
                  : msg.type === 'video' ? '🎬 Video'
                  : '📎 Attachment';
                const mediaActivityId = await withSystemContext(prisma, source.tenantId, async (tx) => {
                  const created = await tx.leadActivity.create({
                    data: {
                      leadId: mediaLead.id,
                      tenantId: source.tenantId,
                      actorIsAi: true,
                      type: 'WHATSAPP',
                      payload: {
                        message: media?.caption ? `${label} — ${media.caption}` : label,
                        direction: 'inbound',
                        waMessageId: msg.id,
                        media: {
                          type: msg.type,
                          mediaId: media?.id,
                          caption: media?.caption,
                          filename: media?.filename,
                          mime: media?.mime_type,
                        },
                      } as object,
                    },
                    select: { id: true },
                  });
                  const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
                  await tx.waSession.upsert({
                    where: { tenantId_phone: { tenantId: source.tenantId, phone: msg.from } },
                    create: { tenantId: source.tenantId, leadId: mediaLead.id, phone: msg.from, sessionExpiresAt: sessionExpiry, lastMessageAt: new Date() },
                    update: { lastMessageAt: new Date(), sessionExpiresAt: sessionExpiry },
                  });
                  return created.id;
                });
                await app.redis.incr(`wa_unread:${source.tenantId}:${mediaLead.id}`).catch(() => {});
                // Download the media to S3 (async) so the inbox can serve it.
                if (media?.id) {
                  await req.server.queues.callWebhook.add('download-whatsapp-media', {
                    eventType: 'download-whatsapp-media',
                    tenantId: source.tenantId,
                    mediaActivityId,
                    mediaId: media.id,
                    raw: {},
                  });
                }
                req.log.info({ tenantId: source.tenantId, leadId: mediaLead.id, mediaType: msg.type }, 'whatsapp.inbound_media_stored');
              }
            }
            continue;
          }

          // Capture NPS replies before treating the message as a fresh lead
          const npsCaptured = await tryCaptureNps(
            source.tenantId,
            msg.from,
            msg.text?.body ?? '',
            req.log,
          );
          if (npsCaptured) continue;

          // Check if this phone belongs to an existing lead
          const existingLead = await withSystemContext(prisma, source.tenantId, (tx) =>
            tx.lead.findFirst({
              where: { tenantId: source.tenantId, phone: msg.from, isDuplicate: false },
              select: { id: true },
              orderBy: { createdAt: 'desc' },
            }),
          );

          if (existingLead) {
            const msgText = msg.text?.body ?? '';
            const OPT_OUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'OPTOUT', 'OPT OUT', 'OPT-OUT'];
            const isOptOut = OPT_OUT_KEYWORDS.includes(msgText.trim().toUpperCase());

            if (isOptOut) {
              await withSystemContext(prisma, source.tenantId, async (tx) => {
                // Mark lead as opted out
                await tx.lead.update({
                  where: { id: existingLead.id },
                  data:  { commsOptedOutAt: new Date() },
                });
                // Cancel all active sequence enrollments
                await tx.sequenceEnrollment.updateMany({
                  where:  { leadId: existingLead.id, tenantId: source.tenantId, status: 'ACTIVE' },
                  data:   { status: 'OPTED_OUT', completedAt: new Date() },
                });
                // Log activity
                await tx.leadActivity.create({
                  data: {
                    leadId:    existingLead.id,
                    tenantId:  source.tenantId,
                    actorIsAi: true,
                    type:      'NOTE',
                    payload: { note: 'Customer sent STOP — opted out of all WhatsApp communications.' } as object,
                  },
                });
              });
              // Send opt-out confirmation back to customer
              await req.server.queues.whatsappSend.add('whatsapp-send', {
                tenantId: source.tenantId,
                leadId:   existingLead.id,
                phone:    msg.from,
                template: 'DIRECT_MESSAGE',
                vars: { message: 'You have been unsubscribed from Excess Renew messages. Reply START to re-subscribe.' },
              });
              req.log.info({ tenantId: source.tenantId, leadId: existingLead.id }, 'whatsapp.opt_out');
              continue;
            }

            await withSystemContext(prisma, source.tenantId, async (tx) => {
              await tx.leadActivity.create({
                data: {
                  leadId:    existingLead.id,
                  tenantId:  source.tenantId,
                  actorIsAi: true,
                  type:      'WHATSAPP',
                  payload: {
                    message:     msgText,
                    direction:   'inbound',
                    waMessageId: msg.id,
                  } as object,
                },
              });
              const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
              await tx.waSession.upsert({
                where:  { tenantId_phone: { tenantId: source.tenantId, phone: msg.from } },
                create: {
                  tenantId:        source.tenantId,
                  leadId:          existingLead.id,
                  phone:           msg.from,
                  sessionExpiresAt: sessionExpiry,
                  lastMessageAt:   new Date(),
                },
                update: { lastMessageAt: new Date(), sessionExpiresAt: sessionExpiry },
              });
            });
            // Inbox unread badge (Redis-backed; cleared when an agent opens the chat).
            await app.redis.incr(`wa_unread:${source.tenantId}:${existingLead.id}`).catch(() => {});
            req.log.info({ tenantId: source.tenantId, leadId: existingLead.id, waMessageId: msg.id }, 'whatsapp.inbound_reply_stored');
            continue;
          }

          const contact = v.contacts?.find((c) => c.wa_id === msg.from);
          const name = contact?.profile.name ?? 'WhatsApp User';

          await req.server.queues.leadIngest.add('lead-ingest', {
            sourceType: 'WHATSAPP',
            sourceId: source.id,
            tenantId: source.tenantId,
            externalId: msg.id,
            name,
            phone: msg.from,
            rawData: { msg, contact: contact ?? null },
          });
        }
      }
    }

    return reply.code(200).send('ok');
  });
};
