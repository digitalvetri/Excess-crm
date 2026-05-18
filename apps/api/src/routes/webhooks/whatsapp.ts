import type { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { env } from '@excess/config';
import { prisma, withSystemContext, SYSTEM_TENANT_ID } from '@excess/db';

interface WaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
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
    const rawBody = JSON.stringify(req.body);

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
          if (msg.type !== 'text') continue;

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
