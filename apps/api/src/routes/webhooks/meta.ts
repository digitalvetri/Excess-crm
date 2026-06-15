import type { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { env } from '@excess/config';
import { prisma, withSystemContext, SYSTEM_TENANT_ID } from '@excess/db';

interface MetaWebhookBody {
  object: string;
  entry: {
    id: string;
    changes: {
      value: {
        leadgen_id: string;
        form_id: string;
        page_id: string;
        ad_id?: string;
        campaign_id?: string;
        ad_name?: string;
        campaign_name?: string;
        created_time: number;
        field_data?: { name: string; values: string[] }[];
      };
      field: string;
    }[];
  }[];
}

function verifyMeta(rawBody: string, signature: string): boolean {
  if (!env.META_WEBHOOK_APP_SECRET) return false;
  const expected = `sha256=${crypto
    .createHmac('sha256', env.META_WEBHOOK_APP_SECRET)
    .update(rawBody)
    .digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export const metaWebhookRoutes: FastifyPluginAsync = async (app) => {
  // GET /webhooks/meta — verification challenge
  app.get('/meta', { config: { public: true } }, async (req, reply) => {
    const q = req.query as Record<string, string>;
    if (
      q['hub.mode'] === 'subscribe' &&
      q['hub.verify_token'] === env.META_WEBHOOK_VERIFY_TOKEN
    ) {
      return reply.send(q['hub.challenge']);
    }
    return reply.code(403).send('Forbidden');
  });

  // POST /webhooks/meta — lead ad events
  app.post('/meta', { config: { public: true } }, async (req, reply) => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = req.rawBody ?? JSON.stringify(req.body);

    if (!signature || !verifyMeta(rawBody, signature)) {
      req.log.warn('Meta webhook HMAC mismatch');
      return reply.code(200).send('ok'); // always 200 to stop retries
    }

    const body = req.body as MetaWebhookBody;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen') continue;
        const v = change.value;

        // Find tenant by Meta page ID stored in config JSON — cross-tenant admin lookup
        const sources = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
          tx.leadSource.findMany({
            where: { type: 'META', isActive: true },
            select: { id: true, tenantId: true, config: true },
          }),
        );
        const source = sources.find((s) => {
          const cfg = s.config as Record<string, unknown>;
          if (cfg['pageId'] !== v.page_id) return false;
          if (cfg['formId'] && cfg['formId'] !== v.form_id) return false;
          return true;
        });
        if (!source) continue;

        // field_data is not present in real Meta webhooks — the worker fetches
        // actual lead fields from the Graph API using the pageAccessToken.
        const cfg = source.config as Record<string, unknown>;
        await req.server.queues.leadIngest.add('lead-ingest', {
          sourceType: 'META',
          sourceId: source.id,
          tenantId: source.tenantId,
          externalId: v.leadgen_id,
          name: 'Pending',
          phone: '',
          rawData: {
            leadgenId:        v.leadgen_id,
            formId:           v.form_id,
            pageId:           v.page_id,
            pageAccessToken:  (cfg['pageAccessToken'] as string | undefined) ?? null,
          },
        });
      }
    }

    return reply.code(200).send('ok');
  });
};
