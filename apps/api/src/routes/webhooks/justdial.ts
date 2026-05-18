import { createHash, timingSafeEqual } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import { prisma, withSystemContext, SYSTEM_TENANT_ID } from '@excess/db';

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

interface JustDialLead {
  requestid?: string;
  name?: string;
  mobile?: string;
  email?: string;
  city?: string;
  secret?: string;
  key?: string;
}

export const justdialWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/justdial', { config: { public: true } }, async (req, reply) => {
    const body = req.body as JustDialLead;
    const incomingKey = body.key ?? body.secret ?? '';

    // Cross-tenant admin lookup — source key identifies tenant
    const sources = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
      tx.leadSource.findMany({
        where: { type: 'JUSTDIAL', isActive: true },
        select: { id: true, tenantId: true, config: true },
      }),
    );

    const source = sources.find((s) => {
      const cfg = s.config as Record<string, unknown>;
      return (
        (typeof cfg['secret'] === 'string' && safeEqual(cfg['secret'], incomingKey)) ||
        (typeof cfg['apiKey'] === 'string' && safeEqual(cfg['apiKey'], incomingKey))
      );
    });

    if (!source) {
      req.log.warn({ keyPrefix: incomingKey.slice(0, 4) }, 'justdial.unknown_source_key');
      return reply.code(200).send('ok');
    }

    if (!body.mobile) return reply.code(200).send('ok');

    await req.server.queues.leadIngest.add('lead-ingest', {
      sourceType: 'JUSTDIAL',
      sourceId: source.id,
      tenantId: source.tenantId,
      externalId: body.requestid,
      name: body.name ?? 'Unknown',
      phone: body.mobile,
      email: body.email,
      city: body.city,
      rawData: body as Record<string, unknown>,
    });

    return reply.code(200).send('ok');
  });
};
